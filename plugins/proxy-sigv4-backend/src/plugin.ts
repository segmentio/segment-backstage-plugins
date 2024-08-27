import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';

import { createRouter } from './service/router';

export const proxySigV4Plugin = createBackendPlugin({
  pluginId: 'proxy-sigv4',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        http: coreServices.httpRouter,
      },
      async init({ config, logger, http }) {
        http.use(await createRouter({ logger, config }));

        if (
          config.getOptionalBoolean(
            'proxysigv4.allowUnauthenticatedRequests',
          ) ??
          true
        )
          http.addAuthPolicy({
            allow: 'unauthenticated',
            path: '/',
          });
      },
    });
  },
});
