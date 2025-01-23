import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// app plugin installation
backend.add(import('@backstage/plugin-app-backend'));

// proxy plugin installation
backend.add(import('@backstage/plugin-proxy-backend'));

// techdocs plugin installation
backend.add(import('@backstage/plugin-techdocs-backend'));

// catalog plugin installation
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// scaffolder plugin installation
backend.add(import('@backstage/plugin-scaffolder-backend'));

// auth plugin installation
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));

// search plugin installation
backend.add(import('@backstage/plugin-search-backend'));
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// proxy-sigv4 plugin installation
backend.add(import('@segment/backstage-plugin-proxy-sigv4-backend'));

backend.start();
