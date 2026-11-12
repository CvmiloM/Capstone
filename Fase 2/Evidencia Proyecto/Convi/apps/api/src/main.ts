import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configurarCabeceras } from './common/cabeceras.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarCabeceras(app);
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
