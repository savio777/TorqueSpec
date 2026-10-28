import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDeps, loggerOptions } from "./container.js";
import { migrate } from "./db/migrate.js";

const env = loadEnv();
const deps = createDeps(env);
const app = await buildApp(deps, { logger: loggerOptions(env) });

await migrate(deps.db, (message) => app.log.info(message));

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "encerrando API");
  await app.close();
  await deps.queue.close();
  await deps.db.end();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await app.listen({ host: env.HOST, port: env.PORT });
app.log.info(`documentação: http://localhost:${env.PORT}/docs`);
