import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AuthModule } from '../auth/auth.module.js';
import { CuentasController } from './cuentas.controller.js';
import { CuentasService, SUPABASE_ADMIN } from './cuentas.service.js';

// Cuentas de la escuela e invitaciones (PB-010). Importa AuthModule para usar
// CuentaService y el mismo control de sesión que el resto de la API (PB-127).
@Module({
  imports: [AuthModule],
  controllers: [CuentasController],
  providers: [
    CuentasService,
    {
      provide: SUPABASE_ADMIN,
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
export class CuentasModule {}
