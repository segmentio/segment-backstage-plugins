# Analytics Module: Segment

This plugin provides an opinionated implementation of the Backstage Analytics
API for [Segment][segment]. Once installed and configured, analytics events will
be sent to the configured Segment Workspace as your users navigate and use your Backstage instance.

## Requirements

This plugin requires an active workspace with [Segment][segment]. Please reference the [Getting Started Guide][getting-started] to get set up before proceeding.

## Installation

### Install the plugin package in your Backstage app:

```sh
# From your Backstage root directory
yarn --cwd packages/app add @segment/backstage-plugin-analytics-module-segment
```

### Wire up the API implementation to your App:

```ts
// packages/app/src/apis.ts
import {
  analyticsApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { SegmentAnalytics } from '@segment/backstage-plugin-analytics-module-segment';

export const apis: AnyApiFactory[] = [
  // Instantiate and register the SegmentAnalytics API Implementation.
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef, identityApi: identityApiRef },
    factory: ({ configApi, identityApi }) =>
      SegmentAnalytics.fromConfig(configApi, {
        identityApi,
      }),
  }),
];
```

#### Optional: Configure a user transform

By default, this analytics plugin [identifies][identify] the user taking actions as the logged in Backstage User's entity reference string (e.g. `user:development/guest`). Currently, no other information is provided to the identify call.

To anonymize users, a `userIdTransform` can be provided in one of two ways:

1. The string value `sha-256`
2. A custom transformation function that matches the contract of `(userEntityRef: string) => Promise<string>`

If `sha-256` is provided, the user entity reference will be pseudonymized into a sha256 string value.

```ts
// packages/app/src/apis.ts
import {
  analyticsApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { SegmentAnalytics } from '@segment/backstage-plugin-analytics-module-segment';

export const apis: AnyApiFactory[] = [
  // Instantiate and register the SegmentAnalytics API Implementation.
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef, identityApi: identityApiRef },
    factory: ({ configApi, identityApi }) =>
      SegmentAnalytics.fromConfig(configApi, {
        identityApi,
        userIdTransform: 'sha-256',
      }),
  }),
];
```

For enhanced security, providing a custom transformation function can be used to hash the value in any means desired.

```ts
// packages/app/src/apis.ts
import {
  analyticsApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { SegmentAnalytics } from '@segment/backstage-plugin-analytics-module-segment';

export const apis: AnyApiFactory[] = [
  // Instantiate and register the SegmentAnalytics API Implementation.
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef, identityApi: identityApiRef },
    factory: ({ configApi, identityApi }) =>
      SegmentAnalytics.fromConfig(configApi, {
        identityApi,
        async userIdTransform(userEntityRef: string) {
          const salt = configApi.getString(
            'custom.config.analytics.userIdSalt',
          );
          const textToChars = (text: string) =>
            text.split('').map(c => c.charCodeAt(0));
          const byteHex = (n: number) =>
            ('0' + Number(n).toString(16)).substring(-2);
          const applySaltToChar = (code: number) =>
            textToChars(salt).reduce((a, b) => a ^ b, code);

          return textToChars(userEntityRef)
            .map(applySaltToChar)
            .map(byteHex)
            .join('');
        },
      }),
  }),
];
```

#### Optional: Prevent user identification

If you choose not to identify Backstage users in analytics events, simply neglect to provide the `identityApi` when initializing the `SegmentAnalytics` API.

```ts
// packages/app/src/apis.ts
import { analyticsApiRef, configApiRef } from '@backstage/core-plugin-api';
import { SegmentAnalytics } from '@segment/backstage-plugin-analytics-module-segment';

export const apis: AnyApiFactory[] = [
  // Instantiate and register the SegmentAnalytics API Implementation.
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => SegmentAnalytics.fromConfig(configApi),
  }),
];
```

Doing so will allow analytic events to continue to be sent to Segment, just with the the events being attributed to [anonymous user IDs][anonymous-ids].

### Configure the plugin in your `app-config.yaml`:

The following is the minimum configuration required to start sending analytics
events to Segment. The only requirement is the [write key][write-key] for the [Analytics.js Source][analytics.js-source] that was created for your Backstage instance.

```yaml
# app-config.yaml
app:
  analytics:
    segment:
      writeKey: abcABCfooBARtestKEY
```

## Configuration

### Disabling

In some pre-production environments, it may not be prudent to load the Segment Analytics plugin at all. In those cases, you can explicitly disable analytics through app configuration:

```yaml
# app-config.yaml
app:
  analytics:
    segment:
      enabled: false # Prevent the analytics instance from loading
      writeKey: abcABCfooBARtestKEY # write key is still required in app-config
```

### Debugging and Testing

In pre-production environments, you may wish to set additional configurations
to turn off reporting to Analytics and/or print debug statements to the
console. In those cases, you can explicitly disable analytics through app configuration:

```yaml
app:
  analytics:
    segment:
      writeKey: abcABCfooBARtestKEY
      testMode: true # Prevents data being sent to Segment and logs what would have been sent instead
      debug: true # Configure debug on the Analytics module and write the Backstage analytics event to the web console
```

### Analytics agent options

Additional configuration is available to configure the Analytics.js agent as follows:

```yaml
app:
  analytics:
    segment:
      writeKey: abcABCfooBARtestKEY
      agent:
        # Disable storing any data on the client-side via cookies or localstorage
        disableClientPersistence: true
        # Disables automatically converting ISO string event properties into Dates.
        disableAutoISOConversion: true
        # Whether or not to capture page context early so that it is always up-to-date.
        initialPageView: true
```

> [!NOTE]\
> The `testMode` and `debug` configuration fields work independently of each other.
> If `debug` is `true` and `testMode` is `false`, analytics events will still be sent to Segment
> and debug information will be written to the console still.

[segment]: https://segment.com/
[getting-started]: https://segment.com/docs/getting-started/
[write-key]: https://segment.com/docs/connections/find-writekey/
[analytics.js-source]: https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/
[identify]: https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/#identify
[anonymous-ids]: https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/identity/#anonymous-ids
