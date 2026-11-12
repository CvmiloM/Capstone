import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';

export function configurarCabeceras(app: INestApplication) {
  const servidor = app.getHttpAdapter().getInstance() as Express;
  servidor.disable('x-powered-by');
  servidor.use((_peticion, respuesta, siguiente) => {
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.setHeader('X-Frame-Options', 'DENY');
    siguiente();
  });
}
