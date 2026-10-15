import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AuthModule } from '../auth/auth.module.js';
import { ImportacionesController } from './importaciones.controller.js';
import {
  ImportacionesService,
  SUPABASE_STORAGE,
} from './importaciones.service.js';

// Módulo de Camilo: importaciones administrativas (PB-019, HU-015). Importa
// AuthModule para usar CuentaService y el control de sesión de PB-127. Usa la
// clave de servicio de Supabase solo para guardar archivos en el espacio
// privado; los datos pasan siempre por CuentaService.operar.
@Module({
  imports: [AuthModule],
  controllers: [ImportacionesController],
  providers: [
    ImportacionesService,
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