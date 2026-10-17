import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AuthModule } from '../auth/auth.module.js';
import { COLA_CONFIRMACION, crearCola } from './cola.js';
import { ImportacionesController } from './importaciones.controller.js';
import {
  ImportacionesService,
  SUPABASE_STORAGE,
} from './importaciones.service.js';
import { TrabajadorConfirmacion } from './trabajador.js';

// Módulo de Camilo: importaciones administrativas (PB-019, PB-020, PB-026 y
// PB-027). Importa AuthModule para usar CuentaService y el control de sesión
// de PB-127. Usa la clave de servicio de Supabase para guardar archivos en el
// espacio privado y para invitar a los profesores importados, y la cola de
// Redis (REDIS_URL) para confirmar en segundo plano; los datos pasan siempre
// por CuentaService.operar.
@Module({
  imports: [AuthModule],
  controllers: [ImportacionesController],
  providers: [
    ImportacionesService,
    { provide: COLA_CONFIRMACION, useFactory: crearCola },
    TrabajadorConfirmacion,
    {
      provide: SUPABASE_STORAGE,
      useFactory: () => {
        const url = process.env.SUPABASE_URL;
        const clave =
          process.env.SUPABASE_SECRET_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !clave)
          throw new Error(
            'Falta configurar SUPABASE_URL o SUPABASE_SECRET_KEY en la API.',
          );
        return createClient(url, clave, {
          // Cliente del servidor: no guarda ni renueva sesiones de personas.
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
      },
    },
  ],
})
export class ImportacionesModule {}