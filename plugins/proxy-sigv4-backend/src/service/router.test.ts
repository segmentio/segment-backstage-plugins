import { getVoidLogger } from '@backstage/backend-common';
import { ConfigReader } from '@backstage/config';

import {
  buildMiddleware,
  createRouter,
  normalizeRouteConfig,
  normalizeRoutePath,
} from './router';

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

describe('buildMiddleware', () => {
  const logger = getVoidLogger();

  it('returns a middleware-like function', () => {
    const mw = buildMiddleware({
      logger,
      routePath: '/foo',
      routeConfig: {
        target: 'https://example.com',
      },
    });
    expect(mw).toEqual(expect.any(Function));
    expect(mw).toHaveProperty('length', 3); // req, res, next
  });
});

describe('createRouter', () => {
  const logger = getVoidLogger();

  describe('when all proxy config are valid', () => {
    describe('and short form is used', () => {
      it('works', async () => {
        const config = new ConfigReader({
          backend: {
            baseUrl: 'https://example.com:7007',
            listen: {
              port: 7007,
            },
          },
          proxysigv4: {
            '/test': 'https://example.com',
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
      const config = new ConfigReader({
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
      const config = new ConfigReader({
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
      });
      const router = await createRouter({
        config,
        logger,
      });
      expect(router).toBeDefined();
    });
  });
});
