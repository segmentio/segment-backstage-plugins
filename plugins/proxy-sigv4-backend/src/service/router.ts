import HttpAgent, { HttpsAgent } from 'agentkeepalive';
import AWS from 'aws-sdk';
import type { Config } from '@backstage/config';
import express from 'express';
import Router from 'express-promise-router';
import got4aws from 'got4aws';
import path from 'node:path';
import type { Logger } from 'winston';

const DEFAULT_CREDENTIAL_REFRESH_INTERVAL_MS = 30 * 1000;

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
  logger: Logger;
  config: Config;
}

export interface MiddlewareOptions {
  logger: Logger;
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

export function normalizeRoutePath(routePath: string): string {
  if (!routePath.startsWith('/')) {
    throw new TypeError(
      `Route path must be an absolute path starting with '/': ${routePath}`,
    );
  }

  return path.normalize(routePath);
}

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

export function buildMiddleware(
  options: MiddlewareOptions,
): express.RequestHandler {
  const { logger, routePath, routeConfig } = options;

  logger.info(`Configuring route handler for '${routePath}'`);

  const {
    target,
    roleArn,
    roleSessionName = 'backstage-plugin-proxy-sigv4-backend',
  } = routeConfig;

  const credentials = roleArn
    ? new AWS.ChainableTemporaryCredentials({
        params: {
          RoleArn: roleArn,
          RoleSessionName: roleSessionName,
        },
      })
    : (AWS.config.credentials as AWS.Credentials);

  // automatically refresh stale expirable credentials out of band to prevent cold caches from degrading the user experience
  setInterval(() => {
    if (credentials.needsRefresh()) {
      credentials.refreshPromise().catch(err => {
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

  const client = got4aws({
    providers: credentials,
  }).extend({
    prefixUrl: target,
    headers: {
      // got unnecessarily configures the user agent header with information about got itself. unset this default
      'user-agent': undefined,
    },
    throwHttpErrors: false,
    agent: {
      http: new HttpAgent(),
      https: new HttpsAgent(),
    },
  });

  const allowedHeaders = new Set<string>([
    ...REQUEST_HEADERS_ALLOWLIST,
    // TODO: include additional allowed headers from router config
  ]);

  const filterHeaders = (input: HeadersMap) => {
    const output: HeadersMap = {};
    Object.entries(input).forEach(([name, value]) => {
      if (allowedHeaders.has(name.toLocaleLowerCase())) {
        output[name] = value!;
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

      const requestOptions: any = {
        method: req.method as any,
        searchParams: req.query as any,
        headers: requestHeaders as any,
      };

      if (req.is('application/json') && req.method !== 'GET') {
        requestOptions.body = JSON.stringify(req.body);
      }

      const { headers, body, statusCode } = await client(
        req.path.substring(1),
        requestOptions,
      );

      const responseHeaders = filterHeaders(headers as HeadersMap);

      res.status(statusCode).set(responseHeaders).send(body);
    } catch (err) {
      next(err);
    }
  };
}

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

  normalizedRoutePathsAndConfigs.forEach(([routePath, routeConfig]) => {
    router.use(routePath, buildMiddleware({ logger, routePath, routeConfig }));
  });

  return router;
}
