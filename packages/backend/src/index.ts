import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// app plugin installation
backend.add(import('@backstage/plugin-app-backend/alpha'));

// proxy plugin installation
backend.add(import('@backstage/plugin-proxy-backend/alpha'));

// techdocs plugin installation
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));

// catalog plugin installation
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// scaffolder plugin installation
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));

// auth plugin installation
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));

// search plugin installation
backend.add(import('@backstage/plugin-search-backend/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));

// proxy-sigv4 plugin installation
backend.add(import('@segment/backstage-plugin-proxy-sigv4-backend'));

backend.start();
