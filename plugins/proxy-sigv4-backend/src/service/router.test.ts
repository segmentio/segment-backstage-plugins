import express from 'express';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';

import { mockServices } from '@backstage/backend-test-utils';
import { registerMswTestHooks } from '@backstage/test-utils';

import {
  buildMiddleware,
  createRouter,
  joinUrl,
  normalizeRouteConfig,
  normalizeRoutePath,
  credentialsNeedRefresh,
} from './router';

const mockNodeProviderChainCredentials = jest.fn().mockResolvedValue({
  accessKeyId: 'ACCESS_KEY_ID_NODE_PROVIDER_CHAIN',
  secretAccessKey: 'SECRET_ACCESS_KEY',
});

const mockTemporaryCredentials = jest.fn().mockResolvedValue({
  accessKeyId: 'ACCESS_KEY_ID_TEMPORARY_CREDENTIALS',
  secretAccessKey: 'SECRET_ACCESS_KEY',
});

// SSRF_EXAMPLES provides a list of SSRF attack examples and their expected normalized paths
const SSRF_EXAMPLES = [
  ['//attacker.example.com/', ''],
  ['%2F/attacker.example.com/', '%2F/attacker.example.com/'],
  ['%2F%2Fattacker.example.com/', '%2F%2Fattacker.example.com/'],
  ['\\attacker.example.com/', 'attacker.example.com/'],
  ['%5C%5Cattacker.example.com/', '%5C%5Cattacker.example.com/'],
  ['/%2Fattacker.example.com/', '%2Fattacker.example.com/'],
  ['//trusted.internal@attacker.example.com/', ''],
  [
    '%2F%2Ftrusted.internal%40attacker.example.com/',
    '%2F%2Ftrusted.internal%40attacker.example.com/',
  ],
  ['%252F%252Fattacker.example.com/', '%252F%252Fattacker.example.com/'],
  [
    '\uFF0F\uFF0Fattacker.example.com/',
    '%EF%BC%8F%EF%BC%8Fattacker.example.com/',
  ],
  ['/%09/attacker.example.com/', '%09/attacker.example.com/'],
  ['/%0A/attacker.example.com/', '%0A/attacker.example.com/'],
];

jest.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: jest
    .fn()
    .mockImplementation(() => mockNodeProviderChainCredentials),
  fromTemporaryCredentials: jest
    .fn()
    .mockImplementation(() => mockTemporaryCredentials),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizeRoutePath', () => {
  describe('when path starts with `/`', () => {
    it('returns normalized path', () => {
      expect(normalizeRoutePath('/path1')).toEqual('/path1');
      expect(normalizeRoutePath('/a/../path1')).toEqual('/path1');
    });
  });
  describe('when path does not start with `/`', () => {
    it('throws TypeError', () => {
      expect(() => {
        normalizeRoutePath('missingLeadingSlash');
      }).toThrow(/must be an absolute path starting with/);
    });
  });
});

describe('normalizeRouteConfig', () => {
  describe('when config is a string', () => {
    it('converts to object with `target` property', () => {
      expect(normalizeRouteConfig('https://example.com')).toMatchObject({
        target: 'https://example.com',
      });
    });
  });
  describe('when config is an object', () => {
    describe('and is missing a `target`', () => {
      it('throws TypeError', () => {
        expect(() => {
          normalizeRouteConfig({});
        }).toThrow(/target must be a string/);
      });
    });
    describe('and `target` is not a valid URL', () => {
      it('throws TypeError', () => {
        expect(() => {
          normalizeRouteConfig({
            target: 'not/a/url',
          });
        }).toThrow(/target must be a valid URL/);
      });
    });
    describe('and `target` is a valid URL', () => {
      it('works', () => {
        expect(
          normalizeRouteConfig({
            target: 'https://example.com',
            roleArn: 'arn:aws:iam::000000000000:role/valid-role',
            roleSessionName: 'mySession',
          }),
        ).toMatchObject({
          target: 'https://example.com',
          roleArn: 'arn:aws:iam::000000000000:role/valid-role',
          roleSessionName: 'mySession',
        });
      });
    });
    it('works with only target provided', () => {
      expect(
        normalizeRouteConfig({
          target: 'https://example.com',
        }),
      ).toMatchObject({
        target: 'https://example.com',
      });
    });
    describe('and has a malformed `roleArn`', () => {
      it('throws TypeError', () => {
        expect(() => {
          normalizeRouteConfig({
            target: 'https://example.com',
            roleArn: 12345,
          });
        }).toThrow(/IAM Role ARN must match pattern/);
        expect(() => {
          normalizeRouteConfig({
            target: 'https://example.com',
            roleArn: 'some-role-name-not-an-arn',
          });
        }).toThrow(/IAM Role ARN must match pattern/);
      });
    });
    describe('and has a valid `roleArn` but no `roleSessionName`', () => {
      it('sets a default `roleSessionName`', () => {
        expect(
          normalizeRouteConfig({
            target: 'https://example.com',
            roleArn: 'arn:aws:iam::000000000000:role/valid-role',
          }),
        ).toMatchObject(
          expect.objectContaining({
            roleSessionName: 'tempAssumeRoleSession',
          }),
        );
      });
    });
  });
});

describe('joinUrl', () => {
  it('joins a request path onto the base URL', () => {
    expect(joinUrl(new URL('https://example.com'), '/foo').toString()).toBe(
      'https://example.com/foo',
    );
  });

  it('preserves a path prefix on the base URL', () => {
    expect(joinUrl(new URL('https://example.com/api'), '/foo').toString()).toBe(
      'https://example.com/api/foo',
    );
  });

  it('collapses a trailing slash on the base URL', () => {
    expect(
      joinUrl(new URL('https://example.com/api/'), '/foo').toString(),
    ).toBe('https://example.com/api/foo');
  });

  it('preserves the query string from the request path', () => {
    expect(
      joinUrl(new URL('https://example.com'), '/foo?q=1&r=2').toString(),
    ).toBe('https://example.com/foo?q=1&r=2');
  });

  it('rejects a host hijack via protocol-relative path', () => {
    const joined = joinUrl(new URL('https://example.com'), '//evil.com/foo');
    expect(joined.host).toBe('example.com');
    expect(joined.toString()).toBe('https://example.com/foo');
  });

  it('rejects a host hijack via absolute URL in the request path', () => {
    const joined = joinUrl(
      new URL('https://example.com'),
      'https://evil.com/foo',
    );
    expect(joined.host).toBe('example.com');
    expect(joined.toString()).toBe('https://example.com/foo');
  });

  it('preserves the configured protocol when the base is http', () => {
    expect(joinUrl(new URL('http://example.com'), '/foo').toString()).toBe(
      'http://example.com/foo',
    );
  });

  it('handles a root request path', () => {
    expect(joinUrl(new URL('https://example.com/api'), '/').toString()).toBe(
      'https://example.com/api/',
    );
  });

  it.each(SSRF_EXAMPLES)(
    'handles a request path that looks like an SSRF attempt: %s',
    (path, expectedPath) => {
      const joined = joinUrl(new URL('https://example.com'), path);
      expect(joined.host).toBe('example.com');
      expect(joined.toString()).toBe(`https://example.com/${expectedPath}`);
    },
  );
});

describe('credentialsNeedRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-05T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  it('returns true when credentials are about to expire', () => {
    expect(
      credentialsNeedRefresh({
        accessKeyId: 'ACCESS_KEY_ID',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        expiration: new Date('2024-05-05T11:55:00Z'),
      }),
    ).toBe(true);
  });

  it('returns true when credentials are past expiration', () => {
    expect(
      credentialsNeedRefresh({
        accessKeyId: 'ACCESS_KEY_ID',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        expiration: new Date('2024-05-05T00:00:00Z'),
      }),
    ).toBe(true);
  });

  it('returns false when credentials do not have an expiration', () => {
    expect(
      credentialsNeedRefresh({
        accessKeyId: 'ACCESS_KEY_ID',
        secretAccessKey: 'SECRET_ACCESS_KEY',
      }),
    ).toBe(false);
  });

  it('returns false when credentials are not expired', () => {
    expect(
      credentialsNeedRefresh({
        accessKeyId: 'ACCESS_KEY_ID',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        expiration: new Date('2024-05-05T20:00:00Z'),
      }),
    ).toBe(false);
  });
});

describe('buildMiddleware', () => {
  const logger = mockServices.rootLogger();

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves a middleware-like function', async () => {
    const mw = await buildMiddleware({
      logger,
      routePath: '/foo',
      routeConfig: {
        target: 'https://example.com',
      },
    });

    expect(mockNodeProviderChainCredentials).toHaveBeenCalled();
    expect(mockTemporaryCredentials).not.toHaveBeenCalled();
    expect(mw).toEqual(expect.any(Function));
    expect(mw).toHaveProperty('length', 3); // req, res, next
  });

  it('resolves a middleware-like function when route config includes a role arn to assume', async () => {
    const mw = await buildMiddleware({
      logger,
      routePath: '/foo',
      routeConfig: {
        target: 'https://example.com',
        roleArn: 'arn:aws:iam::000000000000:role/valid-role',
      },
    });
    expect(mockNodeProviderChainCredentials).not.toHaveBeenCalled();
    expect(mockTemporaryCredentials).toHaveBeenCalled();
    expect(mw).toEqual(expect.any(Function));
    expect(mw).toHaveProperty('length', 3); // req, res, next
  });

  it('triggers a recurring interval to refresh credentials automatically', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockTemporaryCredentials
      .mockResolvedValueOnce({
        accessKeyId: 'ACCESS_KEY_ID_TEMPORARY_CREDENTIALS',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        expiration: new Date('2024-05-05T11:30:00Z'),
      })
      .mockResolvedValue({
        accessKeyId: 'ACCESS_KEY_ID_TEMPORARY_CREDENTIALS',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        expiration: new Date('2024-05-05T20:30:00Z'),
      });

    // starts the middleware and timer
    await buildMiddleware({
      logger,
      routePath: '/foo',
      routeConfig: {
        target: 'https://example.com',
        roleArn: 'arn:aws:iam::000000000000:role/valid-role',
      },
    });
    expect(mockTemporaryCredentials).toHaveBeenCalledTimes(1);

    // advance 30 seconds to immediately trigger the interval
    await jest.advanceTimersByTimeAsync(30 * 1000);

    // should have a second execution now of the temporary credentials
    expect(mockTemporaryCredentials).toHaveBeenCalledTimes(2);

    // advance 65 seconds to ensure the interval would have run a few times, but not enough to trigger another refresh
    await jest.advanceTimersByTimeAsync(60 * 1000);

    // should not have another execution of the temporary credentials
    expect(mockTemporaryCredentials).toHaveBeenCalledTimes(2);
  });

  it('handles errors refreshing credentials during recurring interval', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockTemporaryCredentials
      .mockResolvedValueOnce({
        accessKeyId: 'ACCESS_KEY_ID_TEMPORARY_CREDENTIALS',
        secretAccessKey: 'SECRET_ACCESS_KEY',
        expiration: new Date('2024-05-05T11:30:00Z'),
      })
      .mockRejectedValue(new Error('Failed to refresh credentials'));

    await buildMiddleware({
      logger,
      routePath: '/foo',
      routeConfig: {
        target: 'https://example.com',
        roleArn: 'arn:aws:iam::000000000000:role/valid-role',
      },
    });
    expect(mockTemporaryCredentials).toHaveBeenCalledTimes(1);

    const logErrorSpy = jest.spyOn(logger, 'error');

    // advance 30 seconds to immediately trigger the interval
    await jest.advanceTimersByTimeAsync(30 * 1000);

    expect(mockTemporaryCredentials).toHaveBeenCalledTimes(2);

    expect(logErrorSpy).toHaveBeenCalledWith(
      'Failed to refresh temporary credentials with error: Failed to refresh credentials (routePath=/foo, roleArn=arn:aws:iam::000000000000:role/valid-role, roleSessionName=backstage-plugin-proxy-sigv4-backend)',
      {
        error: new Error('Failed to refresh credentials'),
        roleArn: 'arn:aws:iam::000000000000:role/valid-role',
        roleSessionName: 'backstage-plugin-proxy-sigv4-backend',
        routePath: '/foo',
      },
    );
  });
});

describe('createRouter', () => {
  const logger = mockServices.rootLogger();

  describe('when all proxy config are valid', () => {
    describe('and short form is used', () => {
      it('works', async () => {
        const config = mockServices.rootConfig({
          data: {
            backend: {
              baseUrl: 'https://example.com:7007',
              listen: {
                port: 7007,
              },
            },
            proxysigv4: {
              '/test': 'https://example.com',
            },
          },
        });
        const router = await createRouter({
          config,
          logger,
        });
        expect(router).toBeDefined();
      });
    });
  });

  describe('and expanded form is used', () => {
    it('works', async () => {
      const config = mockServices.rootConfig({
        data: {
          backend: {
            baseUrl: 'https://example.com:7007',
            listen: {
              port: 7007,
            },
          },
          proxysigv4: {
            '/test': {
              target: 'https://example.com',
            },
          },
        },
      });
      const router = await createRouter({
        config,
        logger,
      });
      expect(router).toBeDefined();
    });
  });

  describe('and mixed short and expanded forms are used', () => {
    it('works', async () => {
      const config = mockServices.rootConfig({
        data: {
          backend: {
            baseUrl: 'https://example.com:7007',
            listen: {
              port: 7007,
            },
          },
          proxysigv4: {
            '/test': {
              target: 'https://example.com',
              roleArn: 'arn:aws:iam::000000000000:role/valid-role',
            },
            '/test2': 'https://example2.com',
          },
        },
      });
      const router = await createRouter({
        config,
        logger,
      });
      expect(router).toBeDefined();
    });
  });

  describe('proxying requests', () => {
    const app = express();
    const server = setupServer();
    registerMswTestHooks(server);

    beforeEach(async () => {
      const config = mockServices.rootConfig({
        data: {
          backend: {
            baseUrl: 'https://example.com:7007',
            listen: {
              port: 7007,
            },
          },
          proxysigv4: {
            '/test': 'https://example.com',
          },
        },
      });
      const router = await createRouter({
        config,
        logger,
      });
      app.use(router);
    });

    it('proxies requests and returns response from target service', async () => {
      server.use(
        rest.get('https://example.com', (_req, res, ctx) => {
          return res(
            ctx.status(200),
            ctx.json({ message: 'Hello from target!' }),
          );
        }),
      );

      const response = await await request(app)
        .get('/test/')
        .set('x-msw-bypass', 'true');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Hello from target!' });
    });

    it('proxies requests and forwards params', async () => {
      expect.assertions(3);
      server.use(
        rest.get('https://example.com', (req, res, ctx) => {
          expect(req.url.searchParams.get('param')).toBe('value');
          return res(
            ctx.status(200),
            ctx.json({ message: 'Hello from target!' }),
          );
        }),
      );

      const response = await await request(app)
        .get('/test/?param=value')
        .set('x-msw-bypass', 'true');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Hello from target!' });
    });

    it('proxies handles deep paths', async () => {
      expect.assertions(3);
      server.use(
        rest.get('https://example.com/and/nested/paths', (req, res, ctx) => {
          expect(req.url.searchParams.get('param')).toBe('value');
          return res(
            ctx.status(200),
            ctx.json({ message: 'Hello from target!' }),
          );
        }),
      );

      const response = await await request(app)
        .get('/test/and/nested/paths?param=value')
        .set('x-msw-bypass', 'true');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Hello from target!' });
    });

    it('does not allow for ssrf', async () => {
      server.use(
        rest.get('https://example.com/', (_req, res, ctx) => {
          return res(
            ctx.status(200),
            ctx.json({ message: 'Hello from target!' }),
          );
        }),
      );

      const response = await await request(app)
        .get('/test////other.domain.com')
        .set('x-msw-bypass', 'true');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Hello from target!' });
    });

    it.each(SSRF_EXAMPLES)(
      'does not allow for ssrf: %s',
      async (path, expectedPath) => {
        server.use(
          rest.get('https://example.com/*', (req, res, ctx) => {
            return res(
              ctx.status(404),
              ctx.json({ message: `Naughty path! ${req.url.pathname}` }),
            );
          }),
        );

        const response = await await request(app)
          .get(`/test/${path}`)
          .set('x-msw-bypass', 'true');
        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          message: `Naughty path! /${expectedPath}`,
        });
      },
    );

    it('normalizes backslashes in the request path', async () => {
      server.use(
        rest.get('https://example.com/127.0.0.1:3007', (_req, res, ctx) => {
          return res(
            ctx.status(200),
            ctx.json({ message: 'Hello from target!' }),
          );
        }),
      );

      const response = await await request(app)
        .get('/test/\\127.0.0.1:3007')
        .set('x-msw-bypass', 'true');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Hello from target!' });
    });

    it('allows valid query params', async () => {
      expect.assertions(3);
      server.use(
        rest.get('https://example.com/', (req, res, ctx) => {
          expect(req.url.searchParams.get('q')).toBe('///some.other.domain');
          return res(
            ctx.status(200),
            ctx.json({ message: 'Hello from target!' }),
          );
        }),
      );

      const response = await await request(app)
        .get('/test?q=///some.other.domain')
        .set('x-msw-bypass', 'true');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Hello from target!' });
    });
  });
});
