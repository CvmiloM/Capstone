import { Controller, Get, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurarCabeceras } from './cabeceras.js';
import configuracionWeb from '../../../web/next.config.js';

@Controller()
class ControlPrueba {
  @Get() leer() { return { disponible: true }; }
  @Get('fallo') fallar() { throw new NotFoundException(); }
}

afterEach(() => { vi.unstubAllEnvs(); });

it('protege también errores de API sin cambiar el tipo JSON', async () => {
  const modulo = await Test.createTestingModule({ controllers: [ControlPrueba] }).compile();
  const app = modulo.createNestApplication();
  configurarCabeceras(app);
  await app.init();
  try {
    for (const [ruta, estado] of [['/', 200], ['/fallo', 404]] as const) {
      const respuesta = await request(app.getHttpServer()).get(ruta).expect(estado);
      expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
      expect(respuesta.headers['x-frame-options']).toBe('DENY');
      expect(respuesta.headers['x-powered-by']).toBeUndefined();
      expect(respuesta.headers['content-type']).toContain('application/json');
    }
  } finally { await app.close(); }
});

it.each(['production', 'development'])('cabeceras web en %s conservan privacidad y restricciones', async entorno => {
  vi.stubEnv('NODE_ENV', entorno);
  const reglas = await configuracionWeb.headers!();
  const global = reglas.find(r => r.source === '/:path*')!;
  const cabeceras = Object.fromEntries(global.headers.map(c => [c.key, c.value]));
  expect(configuracionWeb.poweredByHeader).toBe(false);
  expect(cabeceras['X-Frame-Options']).toBe('SAMEORIGIN');
  expect(cabeceras['X-Content-Type-Options']).toBe('nosniff');
  const csp = cabeceras['Content-Security-Policy'];
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("frame-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("script-src-attr 'none'");
  expect(csp.includes("'unsafe-eval'")).toBe(entorno === 'development');
  expect(csp.includes('upgrade-insecure-requests')).toBe(entorno === 'production');
  expect(csp.includes('ws:')).toBe(entorno === 'development');
  for (const ruta of ['/confirmar-correo', '/registro/confirmar', '/restablecer-contrasena']) {
    const regla = reglas.find(r => r.source === ruta)!;
    expect(regla.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store' });
    expect(regla.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  }
  expect(configuracionWeb.experimental?.serverActions?.allowedOrigins).toBeUndefined();
});
