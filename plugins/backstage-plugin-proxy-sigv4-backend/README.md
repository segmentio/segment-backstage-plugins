# AWS SigV4 Proxy backend plugin

Backend plugin that enables proxy definitions to be declared in, and read from, `app-config.yaml` (just like the
built-in [`proxy-backend` plugin][1]) that will be signed using the [AWS Signature Version 4 (SigV4) request-signing
algorithm][2].

Loosely modeled after the official [AWS SigV4 Proxy project (awslabs/aws-sigv4-proxy)][3].

## Getting started

This plugin has already been added to the Backstage app in this repository, meaning you'll be able to access it by
starting the app, and then navigating to [/api/proxy-sigv4/\*](http://localhost:7007/api/proxy-sigv4/*).

This backend plugin can also be started in a standalone mode via `yarn start` from within this package; however, it will
have limited functionality and this process is most convenient when developing the plugin itself. If you develop using
the standalone server, note that the plugin is mounted at the backend root and _not_ under `/api/`:
[/proxy-sigv4/\*](http://localhost:7007/proxy-sigv4/*).

## Installation

### Add the backend plugin as a dependency to `packages/backend`

```sh
yarn add --cwd packages/backend '@segment/backstage-plugin-proxy-sigv4-backend@*'
```

### Create a new backend plugin wrapper module

You'll need to add the plugin to the router in your `backend` package.

You can do this by creating a file called `packages/backend/src/plugins/proxy-sigv4.ts`. Example content for
`proxy-sigv4.ts` could be something like this.

```ts
// packages/backend/src/plugins/proxy-sigv4.ts

import { createRouter } from '@segment/backstage-plugin-proxy-sigv4-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';

export default async function createPlugin({
  logger,
  config,
}: PluginEnvironment): Promise<Router> {
  return await createRouter({ logger, config });
}
```

### Initialize the wrapper module and mount the router in `packages/backend`

With the `proxy-sigv4.ts` router setup in place, add the router to `packages/backend/src/index.ts`:

```diff
 // packages/backend/src/index.ts

+import proxySigV4 from './plugins/proxy-sigv4';

 async function main() {
   ...
   const createEnv = makeCreateEnv(config);
   ...

   const proxyEnv = useHotMemoize(module, () => createEnv('proxy'));
+  const proxySigV4Env = useHotMemoize(module, () => createEnv('proxy-sigv4'));

   const apiRouter = Router();

   apiRouter.use('/proxy', await proxy(proxyEnv));
+  apiRouter.use('/proxy-sigv4', await proxySigV4(proxySignV4Env));
   ...
 }
```

## Configuration

Proxy routes can be configured using either a short or expanded form.

### Short form

The short form is useful when the default [`AWS.CredentialProviderChain`][4] resolves to a set of AWS credentials that
have the permissions necessary to invoke the target API directly.

This is commonplace when the [IAM instance profile][5] has been configured with a role that has been granted access on
the target API and no additional [`AssumeRole` call][6] is required.

This is also useful during local development when the shell environment used to start the application already has AWS
credentials exported into the shell's environment variables.

```yaml
proxysigv4:
  '/some-local-path': https://<API ID>.execute-api.<region>.amazonaws.com
```

### Expanded form

The expanded form is necessary when an `AssumeRole` call _is_ required, _or_ if the target API service and region cannot
be automatically derived from the URL (commonplace when a custom domain name has been configured for an API Gateway
endpoint).

```yaml
proxysigv4:
  '/some-local-path':
    target: 'https://<API ID>.execute-api.<region>.amazonaws.com'
    roleArn: 'arn:aws:iam::<account>:role/<name>'
    roleSessionName: tempAssumeRoleSession ## optional
```

### Schema

Refer to [`config.d.ts`][7] for the full plugin type definition.

## Limitations

1. No response streaming.
1. No configuration of the forwarded or received headers allowlist.
1. No ability to override or manually configure target URL `service` and `region` properties
   - CNAME'd endpoints are therefore not currently supported
1. Target URLs that lack a trailing slash (`/`) will always have one implicitly applied.
   - e.g.: `https://example.com/foo` will be treated as `https://example.com/foo/`
1. Target URLs with a path prefix _may_ be susceptible to path traversal attacks; test coverage for this is poor.

## Links

- [AWS Signature Version 4 (SigV4) request-signing algorithm][2]
- [Full plugin config schema (`config.d.ts`)][7]

[1]: https://github.com/backstage/backstage/tree/v1.3.1/plugins/proxy-backend
[2]: https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
[3]: https://github.com/awslabs/aws-sigv4-proxy
[4]: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CredentialProviderChain.html#defaultProviders-property
[5]: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html
[6]: https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
[7]: ./config.d.ts
