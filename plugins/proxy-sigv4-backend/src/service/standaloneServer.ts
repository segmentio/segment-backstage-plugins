import {
  createServiceBuilder,
  loadBackendConfig,
} from '@backstage/backend-common';
import { Server } from 'http';
import { Logger } from 'winston';
import { createRouter } from './router';

export interface ServerOptions {
  port: number;
  enableCors: boolean;
  logger: Logger;
}

export async function startStandaloneServer(
  options: ServerOptions,
): Promise<Server> {
  const logger = options.logger.child({ service: 'proxy-sigv4-backend' });

  logger.debug('Creating application...');

  const config = await loadBackendConfig({ logger, argv: process.argv });
  const router = await createRouter({
    config,
    logger,
  });
  let service = createServiceBuilder(module)
    .setPort(options.port)
    .addRouter('/proxy-sigv4', router);
  if (options.enableCors) {
    service = service.enableCors({ origin: 'http://localhost:3000' });
  }

  logger.debug('Starting application server...');

  return await service.start().catch(err => {
    logger.error(err);
    process.exit(1);
  });
}

module.hot?.accept();
