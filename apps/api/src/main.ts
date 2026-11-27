import 'reflect-metadata';
import { createApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
