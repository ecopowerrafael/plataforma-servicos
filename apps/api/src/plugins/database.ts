import plugin from 'fastify-plugin';

import { type DatabaseConnection } from '../database/connection.js';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseConnection;
  }
}

export const databasePlugin = plugin<{ connection: DatabaseConnection }>(
  (app, options, done) => {
    app.decorate('database', options.connection);
    app.addHook('onClose', async () => {
      await options.connection.close();
    });
    done();
  },
  { name: 'database' },
);
