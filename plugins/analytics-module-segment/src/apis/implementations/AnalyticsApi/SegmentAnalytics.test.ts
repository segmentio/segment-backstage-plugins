import { ConfigReader } from '@backstage/config';
import type { IdentityApi } from '@backstage/core-plugin-api';

import { AnalyticsBrowser } from '@segment/analytics-next';

import {
  SegmentAnalytics,
  type UserIdTransformOption,
} from './SegmentAnalytics';

import { mockAnalyticsBrowser } from '../../../setupTests';

const mockIdentityApi: jest.Mocked<IdentityApi> = {
  getBackstageIdentity: jest.fn().mockResolvedValue({
    type: 'user',
    userEntityRef: 'user:development/guest',
    ownershipEntityRefs: ['user:development/guest'],
  }),
} as any as jest.Mocked<IdentityApi>;

const flushPromises = async () => new Promise(res => process.nextTick(res));

const fnLog = jest.spyOn(global.console, 'log').mockImplementation();

describe('SegmentAnalytics', () => {
  let analytics: SegmentAnalytics;

  const buildAnalytics = async ({
    config,
    userIdTransform,
  }: {
    config: ConfigReader;
    userIdTransform?: UserIdTransformOption;
  }) => {
    const sa = SegmentAnalytics.fromConfig(config, {
      identityApi: mockIdentityApi,
      userIdTransform,
    });

    await flushPromises();

    return sa;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws error if no config is provided', async () => {
    const config = new ConfigReader({
      app: {},
    });
    await expect(buildAnalytics({ config })).rejects.toThrow(
      "Missing required config value at 'app.analytics.segment.writeKey' in 'mock-config'",
    );
  });

  it('throws error if no writeKey is provided', async () => {
    const config = new ConfigReader({
      app: {
        analytics: {
          segment: {
            debug: true,
            enabled: true,
            testMode: true,
            agent: {
              disableClientPersistence: true,
              disableAutoISOConversion: true,
              initialPageView: true,
            },
          },
        },
      },
    });
    await expect(buildAnalytics({ config })).rejects.toThrow(
      "Missing required config value at 'app.analytics.segment.writeKey' in 'mock-config'",
    );
  });

  describe('when enabled', () => {
    beforeEach(async () => {
      analytics = await buildAnalytics({
        config: new ConfigReader({
          app: {
            analytics: {
              segment: {
                writeKey: 'abcABCfooBARtestKEY',
              },
            },
          },
        }),
      });
      fnLog.mockClear();
    });

    it('creates the analytics client not in debug mode', async () => {
      expect(AnalyticsBrowser.load).toHaveBeenCalledWith(
        { writeKey: 'abcABCfooBARtestKEY' },
        {
          disable: false,
        },
      );
      expect(mockAnalyticsBrowser.identify).toHaveBeenCalledWith(
        'user:development/guest',
      );
      expect(mockAnalyticsBrowser.debug).toHaveBeenCalledWith(false);
    });

    it('handles navigate events', () => {
      analytics.captureEvent({
        action: 'navigate',
        subject: '/test',
        context: { pluginId: 'test', extensionId: 'test' },
      });

      expect(mockAnalyticsBrowser.page).toHaveBeenCalledWith({
        action: 'navigate',
        category: 'test',
        subject: '/test',
        pluginId: 'test',
        extensionId: 'test',
        additionalContext: {},
      });
      expect(fnLog).not.toHaveBeenCalled();
    });

    it('handles create events', () => {
      analytics.captureEvent({
        action: 'create',
        subject: 'new Template',
        context: {
          pluginId: 'scaffolder',
          routeRef: 'unknown',
          extension: 'scaffolder',
        },
      });

      expect(mockAnalyticsBrowser.track).toHaveBeenCalledWith('new Template', {
        action: 'create',
        category: 'scaffolder',
        subject: 'new Template',
        pluginId: 'scaffolder',
        extensionId: 'scaffolder',
        routeRef: 'unknown',
        additionalContext: {},
      });
      expect(fnLog).not.toHaveBeenCalled();
    });

    it.each(['click', 'search', 'discover', 'not-found'])(
      'handles key event %s',
      action => {
        analytics.captureEvent({
          action,
          subject: 'CI/CD',
          context: { pluginId: 'component', extensionId: '' },
        });

        expect(mockAnalyticsBrowser.track).toHaveBeenCalledWith(action, {
          action,
          category: 'app',
          subject: 'CI/CD',
          pluginId: 'component',
          additionalContext: {},
        });
        expect(fnLog).not.toHaveBeenCalled();
      },
    );
  });

  describe('when not enabled', () => {
    beforeEach(async () => {
      analytics = await buildAnalytics({
        config: new ConfigReader({
          app: {
            analytics: {
              segment: {
                writeKey: 'abcABCfooBARtestKEY',
                enabled: false,
                debug: true,
                testMode: true,
                agent: {
                  disableClientPersistence: true,
                  disableAutoISOConversion: true,
                  initialPageView: true,
                },
              },
            },
          },
        }),
      });
    });

    it('does not initialize SegmentAnalytics', async () => {
      expect(AnalyticsBrowser.load).not.toHaveBeenCalled();
      expect(mockAnalyticsBrowser.identify).not.toHaveBeenCalled();
      expect(fnLog).toHaveBeenCalledWith(
        'backstage-plugin-analytics-module-segment:',
        'Segment Analytics disabled',
      );
    });

    it('does not handle any sent events', async () => {
      fnLog.mockClear();

      analytics.captureEvent({
        action: 'navigate',
        subject: '/test',
        context: { pluginId: 'test', extensionId: 'test' },
      });

      expect(mockAnalyticsBrowser.page).not.toHaveBeenCalled();
      expect(fnLog).not.toHaveBeenCalled();
    });
  });

  describe('with testMode enabled', () => {
    beforeEach(async () => {
      analytics = await buildAnalytics({
        config: new ConfigReader({
          app: {
            analytics: {
              segment: {
                writeKey: 'abcABCfooBARtestKEY',
                testMode: true,
              },
            },
          },
        }),
      });
    });

    it('disables analytics while in test mode', async () => {
      expect(AnalyticsBrowser.load).toHaveBeenCalledWith(
        { writeKey: 'abcABCfooBARtestKEY' },
        {
          disable: true,
        },
      );
      expect(mockAnalyticsBrowser.identify).not.toHaveBeenCalled();
      expect(fnLog).toHaveBeenCalledWith('identify("user:development/guest")');
      expect(mockAnalyticsBrowser.debug).toHaveBeenCalledWith(false);
    });

    it('logs analytics actions that would be sent', async () => {
      fnLog.mockClear();

      analytics.captureEvent({
        action: 'navigate',
        subject: '/test',
        context: { pluginId: 'test', extensionId: 'test' },
      });

      expect(mockAnalyticsBrowser.page).not.toHaveBeenCalled();
      expect(fnLog).toHaveBeenNthCalledWith(1, 'analytics.page()', {
        action: 'navigate',
        category: 'test',
        subject: '/test',
        pluginId: 'test',
        extensionId: 'test',
        additionalContext: {},
      });

      analytics.captureEvent({
        action: 'create',
        subject: 'new Template',
        context: {
          pluginId: 'scaffolder',
          routeRef: 'unknown',
          extension: 'scaffolder',
        },
      });

      expect(mockAnalyticsBrowser.track).not.toHaveBeenCalled();
      expect(fnLog).toHaveBeenNthCalledWith(
        2,
        'analytics.track("new Template")',
        {
          action: 'create',
          category: 'scaffolder',
          subject: 'new Template',
          pluginId: 'scaffolder',
          extensionId: 'scaffolder',
          routeRef: 'unknown',
          additionalContext: {},
        },
      );

      analytics.captureEvent({
        action: 'click',
        subject: 'CI/CD',
        context: { pluginId: 'component', extensionId: '' },
      });

      expect(mockAnalyticsBrowser.track).not.toHaveBeenCalled();
      expect(fnLog).toHaveBeenNthCalledWith(3, 'analytics.track("click")', {
        action: 'click',
        category: 'app',
        subject: 'CI/CD',
        pluginId: 'component',
        additionalContext: {},
      });
    });
  });

  describe('with debug enabled', () => {
    beforeEach(async () => {
      analytics = await buildAnalytics({
        config: new ConfigReader({
          app: {
            analytics: {
              segment: {
                writeKey: 'abcABCfooBARtestKEY',
                debug: true,
              },
            },
          },
        }),
      });
      fnLog.mockClear();
    });

    it('enables debug mode', async () => {
      expect(AnalyticsBrowser.load).toHaveBeenCalledWith(
        { writeKey: 'abcABCfooBARtestKEY' },
        { disable: false },
      );
      expect(mockAnalyticsBrowser.identify).toHaveBeenCalledWith(
        'user:development/guest',
      );
      expect(mockAnalyticsBrowser.debug).toHaveBeenCalledWith(true);
    });

    it('logs analytics actions that would be sent', async () => {
      analytics.captureEvent({
        action: 'navigate',
        subject: '/test',
        context: { pluginId: 'test', extensionId: 'test' },
      });

      expect(mockAnalyticsBrowser.page).toHaveBeenCalledWith({
        action: 'navigate',
        category: 'test',
        subject: '/test',
        pluginId: 'test',
        extensionId: 'test',
        additionalContext: {},
      });
      expect(fnLog).toHaveBeenNthCalledWith(
        1,
        'backstage-plugin-analytics-module-segment:',
        'Capturing event',
        {
          action: 'navigate',
          subject: '/test',
          context: { pluginId: 'test', extensionId: 'test' },
        },
      );

      analytics.captureEvent({
        action: 'create',
        subject: 'new Template',
        context: {
          pluginId: 'scaffolder',
          routeRef: 'unknown',
          extension: 'scaffolder',
        },
      });

      expect(mockAnalyticsBrowser.track).toHaveBeenNthCalledWith(
        1,
        'new Template',
        {
          action: 'create',
          category: 'scaffolder',
          subject: 'new Template',
          pluginId: 'scaffolder',
          extensionId: 'scaffolder',
          routeRef: 'unknown',
          additionalContext: {},
        },
      );
      expect(fnLog).toHaveBeenNthCalledWith(
        2,
        'backstage-plugin-analytics-module-segment:',
        'Capturing event',
        {
          action: 'create',
          subject: 'new Template',
          context: {
            pluginId: 'scaffolder',
            routeRef: 'unknown',
            extension: 'scaffolder',
          },
        },
      );

      analytics.captureEvent({
        action: 'click',
        subject: 'CI/CD',
        context: { pluginId: 'component', extensionId: '' },
      });

      expect(mockAnalyticsBrowser.track).toHaveBeenNthCalledWith(2, 'click', {
        action: 'click',
        category: 'app',
        subject: 'CI/CD',
        pluginId: 'component',
        additionalContext: {},
      });

      expect(fnLog).toHaveBeenNthCalledWith(
        3,
        'backstage-plugin-analytics-module-segment:',
        'Capturing event',
        {
          action: 'click',
          subject: 'CI/CD',
          context: { pluginId: 'component', extensionId: '' },
        },
      );
    });
  });

  describe('with userIdTransform', () => {
    describe('as sha-256', () => {
      beforeEach(async () => {
        analytics = await buildAnalytics({
          config: new ConfigReader({
            app: {
              analytics: {
                segment: {
                  writeKey: 'abcABCfooBARtestKEY',
                },
              },
            },
          }),
          userIdTransform: 'sha-256',
        });
        fnLog.mockClear();
      });

      it('sha256 hashes the user id on identify', async () => {
        expect(mockAnalyticsBrowser.identify).toHaveBeenCalledWith(
          '757365723a646576656c6f706d656e742f6775657374',
        );
      });
    });

    describe('with a custom userIdTransform function', () => {
      beforeEach(async () => {
        analytics = await buildAnalytics({
          config: new ConfigReader({
            app: {
              analytics: {
                segment: {
                  writeKey: 'abcABCfooBARtestKEY',
                },
              },
            },
          }),
          async userIdTransform(userEntityRef) {
            return `hello there fellow ${userEntityRef}`;
          },
        });
        fnLog.mockClear();
      });

      it('sha256 hashes the user id on identify', async () => {
        expect(mockAnalyticsBrowser.identify).toHaveBeenCalledWith(
          'hello there fellow user:development/guest',
        );
      });
    });
  });
});
