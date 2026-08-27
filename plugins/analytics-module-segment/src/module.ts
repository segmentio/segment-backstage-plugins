import {
  configApiRef,
  createFrontendModule,
  identityApiRef,
} from '@backstage/frontend-plugin-api';
import { AnalyticsImplementationBlueprint } from '@backstage/plugin-app-react';

import { SegmentAnalytics } from './apis';

const segmentAnalyticsImplementation = AnalyticsImplementationBlueprint.make({
  name: 'segment',
  params: defineParams =>
    defineParams({
      deps: { configApi: configApiRef, identityApi: identityApiRef },
      factory: ({ configApi, identityApi }) =>
        SegmentAnalytics.fromConfig(configApi, { identityApi }),
    }),
});

/** @public */
export const segmentAnalyticsModule = createFrontendModule({
  pluginId: 'app',
  extensions: [segmentAnalyticsImplementation],
});
