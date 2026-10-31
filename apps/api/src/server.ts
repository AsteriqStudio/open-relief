import { ApiConfigSchema } from './config.js';
import { buildApp } from './app.js';
import { createServices } from './services.js';

const config = ApiConfigSchema.parse(process.env);
const services = await createServices(config);
const app = buildApp(services);

async function shutdown() {
  await app.close();
  await services.close();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

try {
  await app.listen({ host: config.API_BIND_HOST, port: config.PORT });
  console.log(`API listening on ${config.API_BIND_HOST}:${config.PORT} (${config.RUNTIME_MODE})`);
} catch (error) {
  await shutdown();
  throw error;
}
