import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { SesionGuard } from '../../common/sesion.guard.js';
import { BASE_DE_DATOS, CuentaService } from '../../database/cuenta.service.js';
import { AuthController } from './auth.controller.js';
import { IdentidadService, SUPABASE_AUTH } from './identidad.service.js';

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta configurar ${nombre} en la API.`);
  return valor;
}

@Module({
  controllers: [AuthController],
  // Los módulos de negocio importan AuthModule para usar la misma autorización.
  exports: [CuentaService],
  providers: [
    {
      provide: SUPABASE_AUTH,
      useFactory: () =>
        createClient(
          variable('SUPABASE_URL'),
          process.env.SUPABASE_PUBLISHABLE_KEY || variable('SUPABASE_ANON_KEY'),
          {
            // No conservar la sesión de una persona en el cliente compartido del servidor.
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          },
        ),
    },
    {
      provide: BASE_DE_DATOS,
      useFactory: () => {
        const pool = new Pool({
          connectionString: variable('SUPABASE_DB_URL'),
          connectionTimeoutMillis: 5000,
          statement_timeout: 5000,
        });
        pool.on('error', () =>
          new Logger('BaseDeDatos').error('Se perdió una conexión de la API.'),
        );
        return pool;
      },
    },
    IdentidadService,
    CuentaService,
    // Una ruta nueva queda protegida aunque no agregue un control propio.
    { provide: APP_GUARD, useClass: SesionGuard },
  ],
})
export class AuthModule {}
