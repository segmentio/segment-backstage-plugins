import type { Config } from '@backstage/config';
import type {
  AnalyticsApi,
  AnalyticsEvent,
  IdentityApi,
} from '@backstage/core-plugin-api';
import type {
  AnalyticsApi as NewAnalyicsApi,
  AnalyticsEvent as NewAnalyticsEvent,
} from '@backstage/frontend-plugin-api';

import { AnalyticsBrowser } from '@segment/analytics-next';

type UserIdTransform = (userEntityRef: string) => Promise<string>;
export type UserIdTransformOption = 'sha-256' | UserIdTransform;
const defaultUserIdTransform: UserIdTransform = async (userEntityRef: string) =>
  userEntityRef;

const hash = async (value: string): Promise<string> => {
  const digest = await window.crypto.subtle.digest(
    'sha-256',
    new TextEncoder().encode(value),
  );
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

type AgentOptions = {
  disableClientPersistence?: boolean;
  disableAutoISOConversion?: boolean;
  initialPageView?: boolean;
};

export class SegmentAnalytics implements AnalyticsApi, NewAnalyicsApi {
  readonly #agent?: AnalyticsBrowser;
  readonly #debug: boolean;
  readonly #enabled: boolean;
  readonly #testMode: boolean;

  private constructor({
    identityApi,
    userIdTransform,
    writeKey,
    debug,
    enabled,
    testMode,
    agentOptions,
  }: {
    identityApi?: IdentityApi;
    userIdTransform: UserIdTransform;
    writeKey: string;
    debug: boolean;
    enabled: boolean;
    testMode: boolean;
    agentOptions: AgentOptions;
  }) {
    this.#debug = debug;
    this.#enabled = enabled;
    this.#testMode = testMode;

    if (this.#enabled) {
      this.#agent = AnalyticsBrowser.load(
        { writeKey },
        { ...agentOptions, disable: !enabled || testMode },
      );

      this.#agent.debug(this.#debug);
      if (identityApi) {
        identityApi.getBackstageIdentity().then(async ({ userEntityRef }) => {
          const userId = await userIdTransform(userEntityRef);
          if (this.#testMode) {
            // eslint-disable-next-line no-console
            console.log(`identify("${userId}")`);
          } else {
            this.#agent?.identify(userId);
          }
          return;
        });
      }
    } else {
      this.debug('Segment Analytics disabled');
    }
  }

  static fromConfig(
    config: Config,
    options: {
      identityApi?: IdentityApi;
      userIdTransform?: UserIdTransformOption;
    } = {},
  ) {
    let userIdTransform = defaultUserIdTransform;
    if (options.userIdTransform === 'sha-256') {
      userIdTransform = hash;
    } else if (options.userIdTransform) {
      userIdTransform = options.userIdTransform;
    }

    const writeKey = config.getString('app.analytics.segment.writeKey');
    const enabled =
      config.getOptionalBoolean('app.analytics.segment.enabled') ?? true;
    const debug =
      config.getOptionalBoolean('app.analytics.segment.debug') ?? false;
    const testMode =
      config.getOptionalBoolean('app.analytics.segment.testMode') ?? false;
    const agentOptions =
      config.getOptional<AgentOptions>('app.analytics.segment.agent') ?? {};

    return new SegmentAnalytics({
      identityApi: options.identityApi,
      userIdTransform,
      writeKey,
      enabled,
      debug,
      agentOptions,
      testMode,
    });
  }

  captureEvent(event: AnalyticsEvent | NewAnalyticsEvent) {
    if (this.#enabled) {
      this.debug('Capturing event', event);
      const { action, subject, value, context, attributes } = event;
      const {
        routeRef,
        pluginId,
        extension,
        extensionId,
        ...additionalContext
      } = context;
      const normalizedExtensionId = extensionId || extension;
      const category = normalizedExtensionId
        ? String(normalizedExtensionId)
        : 'app';
      const eventProperties = {
        subject,
        action,
        value,
        routeRef,
        pluginId,
        extensionId: normalizedExtensionId,
        category,
        attributes,
        additionalContext,
      };
      switch (event.action) {
        case 'navigate':
          if (this.#testMode) {
            // eslint-disable-next-line no-console
            console.log(`analytics.page()`, eventProperties);
          } else {
            this.#agent?.page(eventProperties);
          }
          break;
        case 'create':
          if (this.#testMode) {
            // eslint-disable-next-line no-console
            console.log(`analytics.track("${event.subject}")`, eventProperties);
          } else {
            this.#agent?.track(event.subject, eventProperties);
          }
          break;
        default:
          if (this.#testMode) {
            // eslint-disable-next-line no-console
            console.log(`analytics.track("${event.action}")`, eventProperties);
          } else {
            this.#agent?.track(event.action, eventProperties);
          }
      }
    }
  }

  private debug(...data: any[]) {
    if (this.#debug) {
      // eslint-disable-next-line no-console
      console.log('backstage-plugin-analytics-module-segment:', ...data);
    }
  }
}
