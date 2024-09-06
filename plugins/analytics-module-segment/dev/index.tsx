import React from 'react';
import {
  analyticsApiRef,
  configApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { createDevApp } from '@backstage/dev-utils';

import { Playground } from './Playground';
import { SegmentAnalytics } from '../src';

createDevApp()
  .registerApi({
    api: analyticsApiRef,
    deps: { configApi: configApiRef, identityApi: identityApiRef },
    factory: ({ configApi, identityApi }) =>
      SegmentAnalytics.fromConfig(configApi, {
        identityApi,
      }),
  })
  .addPage({
    path: '/segment',
    title: 'Segment Playground',
    element: <Playground />,
  })
  .render();
