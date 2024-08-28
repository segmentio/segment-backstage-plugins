import HttpAgent, { HttpsAgent } from 'agentkeepalive';
import * as aws4 from 'aws4';
import express from 'express';
import Router from 'express-promise-router';
import path from 'node:path';
import fetch from 'node-fetch';

import {
  fromNodeProviderChain,
  fromTemporaryCredentials,
} from '@aws-sdk/credential-providers';
import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import type { AwsCredentialIdentity } from '@smithy/types';

const DEFAULT_CREDENTIAL_REFRESH_INTERVAL_MS = 30 * 1000;
const CREDENTIAL_NEED_REFRESH_BUFFER = 5 * 60 * 1000; // Force a refresh 5 minutes before expiration

export const REQUEST_HEADERS_ALLOWLIST = Object.freeze([
  'cache-control',
  'content-language',
  'content-length',
  'content-type',
  'expires',
  'last-modified',
  'pragma',
  'accept',
  'accept-language',
]);

export interface RouterOptions {
  logger: LoggerService;
  config: RootConfigService;
}

export interface MiddlewareOptions {
  logger: LoggerService;
  routePath: string;
  routeConfig: RouteConfig;
}

export interface RouteConfig {
  target: string;
  roleArn?: string;
  roleSessionName?: string;
  // TODO: support specifying/overriding `service` and `region` for CNAME'd endpoints
  // TODO: support specifying additional allowed forward headers
}

type HeadersMap = Record<string, string | string[]>;

/** @internal */
export function normalizeRoutePath(routePath: string): string {
  if (!routePath.startsWith('/')) {
    throw new TypeError(
      `Route path must be an absolute path starting with '/': ${routePath}`,
    );
  }

  return path.normalize(routePath);
}

/** @internal */
export function normalizeRouteConfig(config: any): RouteConfig {
  const fullConfig =
    typeof config === 'string' ? { target: config } : { ...config };

  if (typeof fullConfig.target !== 'string') {
    throw new TypeError(`Route target must be a string`);
  }

  try {
    // eslint-disable-next-line no-new
    new URL(fullConfig.target! as string);
  } catch {
    throw new TypeError(
      `Route target must be a valid URL: ${fullConfig.target ?? ''}`,
    );
  }

  if (fullConfig.roleArn) {
    const permissiveIamArnPattern =
      /arn:(aws[a-zA-Z-]*)?:iam::\d{12}:role\/?.+/;
    if (
      !(
        typeof fullConfig.roleArn === 'string' &&
        fullConfig.roleArn.match(permissiveIamArnPattern)
      )
    ) {
      throw new TypeError(
        `IAM Role ARN must match pattern ${permissiveIamArnPattern.toString()}: ${
          fullConfig.roleArn
        }`,
      );
    }
    fullConfig.roleSessionName =
      fullConfig.roleSessionName ?? 'tempAssumeRoleSession';
  }

  return fullConfig;
}

/** @internal */
export const credentialsNeedRefresh = (
  credentials: AwsCredentialIdentity,
): boolean =>
  !!credentials.expiration &&
  credentials.expiration.getTime() - Date.now() <
    CREDENTIAL_NEED_REFRESH_BUFFER;

/** @internal */
export async function buildMiddleware(
  options: MiddlewareOptions,
): Promise<express.RequestHandler> {
  const { logger, routePath, routeConfig } = options;

  logger.info(`Configuring route handler for '${routePath}'`);

  const {
    target,
    roleArn,
    roleSessionName = 'backstage-plugin-proxy-sigv4-backend',
  } = routeConfig;

  const credentialsProvider = roleArn
    ? fromTemporaryCredentials({
        params: {
          RoleArn: roleArn,
          RoleSessionName: roleSessionName,
        },
      })
    : fromNodeProviderChain(); // default provider chain

  // Immediately resolve credentials
  let credentials = await credentialsProvider();

  // automatically refresh stale expirable credentials out of band to help prevent cold caches from degrading the user experience
  setInterval(async () => {
    if (credentialsNeedRefresh(credentials)) {
      await credentialsProvider()
        .then(refreshedCredentials => (credentials = refreshedCredentials))
        .catch(err => {
          logger.error(
            `Failed to refresh temporary credentials with error: ${err.message} (routePath=${routePath}, roleArn=${roleArn}, roleSessionName=${roleSessionName})`,
            {
              error: err,
              routePath,
              roleArn,
              roleSessionName,
            },
          );
        });
    }
  }, DEFAULT_CREDENTIAL_REFRESH_INTERVAL_MS).unref();

  const allowedHeaders = new Set<string>([
    ...REQUEST_HEADERS_ALLOWLIST,
    // TODO: include additional allowed headers from router config
  ]);

  const filterHeaders = (input: HeadersMap) => {
    const output: Record<string, string> = {};
    Object.entries(input).forEach(([name, value]) => {
      if (allowedHeaders.has(name.toLocaleLowerCase())) {
        output[name] = Array.isArray(value) ? value.join(', ') : value;
      }
    });

    return output;
  };

  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const requestHeaders = filterHeaders(req.headers as HeadersMap);
      const targetUrl = new URL(req.url, target);

      // request is provided to aws4.sign() and mutated in place for new headers
      const request: any = {
        method: req.method,
        protocol: targetUrl.protocol,
        host: targetUrl.host,
        path: req.url, // path + search
        headers: requestHeaders,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        request.body = req.is('application/json')
          ? JSON.stringify(req.body)
          : req.body;
      }

      aws4.sign(request, credentials);

      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        agent:
          request.protocol === 'https:' ? new HttpsAgent() : new HttpAgent(),
      });

      const responseHeaders = filterHeaders(response.headers.raw());

      res
        .status(response.status)
        .set(responseHeaders)
        .send(await response.buffer());
    } catch (err) {
      next(err);
    }
  };
}

/** @public */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  const router = Router();

  router.use(express.json());

  const proxyConfig = config.getOptional('proxysigv4') ?? {};

  const normalizedRoutePathsAndConfigs = Object.entries(proxyConfig).map(
    ([routePath, routeConfig]) => {
      try {
        return [
          normalizeRoutePath(routePath),
          normalizeRouteConfig(routeConfig),
        ];
      } catch (e: any) {
        logger.warn(
          `Failed to configure route for ${routePath} due to ${e.message}`,
        );
        throw e;
      }
    },
  ) as [string, RouteConfig][];

  for (const [routePath, routeConfig] of normalizedRoutePathsAndConfigs) {
    try {
      router.use(
        routePath,
        await buildMiddleware({ logger, routePath, routeConfig }),
      );
    } catch (err: any) {
      logger.error(
        `Failed to configure route for ${routePath} due to ${err.message}`,
        {
          error: err,
          ...routeConfig,
        },
      );
    }
  }

  return router;
}
