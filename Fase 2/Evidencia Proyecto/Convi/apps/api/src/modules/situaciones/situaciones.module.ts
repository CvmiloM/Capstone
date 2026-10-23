import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AuthModule } from '../auth/auth.module.js';
import { CasosController } from './casos.controller.js';
import { CasosService } from './casos.service.js';
import { ConvivenciaController } from './convivencia.controller.js';
import { ConvivenciaService } from './convivencia.service.js';
import {
  EvidenciasConvivenciaController,
  EvidenciasProfesorController,
} from './evidencias.controller.js';
import { ALMACENAMIENTO, EvidenciasService } from './evidencias.service.js';
import { HistorialController } from './historial.controller.js';
import { HistorialService } from './historial.service.js';
import { ProfesorController } from './profesor.controller.js';
import { ProfesorService } from './profesor.service.js';

// Módulo de Fernando: situaciones de convivencia. Importa AuthModule para usar
// CuentaService y el mismo control de sesión que el resto de la API (PB-127).
// PB-074 (Camilo): el historial del estudiante también vive aquí.
// PB-053: los casos, que se abren desde una situación.
// PB-066: las evidencias, guardadas con la clave de servicio en el espacio
// privado de Storage, como los archivos de las importaciones (PB-019).
@Module({
  imports: [AuthModule],
  controllers: [
    ProfesorController,
    ConvivenciaController,
    HistorialController,
    CasosController,
    EvidenciasConvivenciaController,
    EvidenciasProfesorController,
  ],
  providers: [
    ProfesorService,
    ConvivenciaService,
    HistorialService,
    CasosService,
    EvidenciasService,
    {
      provide: ALMACENAMIENTO,
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
export class SituacionesModule {}
