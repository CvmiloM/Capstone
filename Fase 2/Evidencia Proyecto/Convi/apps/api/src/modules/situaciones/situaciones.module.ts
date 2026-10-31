import { SeguimientosController } from './seguimientos.controller.js';
import { SeguimientosService } from './seguimientos.service.js';
import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { AlertasModule } from '../alertas/alertas.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CasosController } from './casos.controller.js';
import { CasosService } from './casos.service.js';
import { ConvivenciaController } from './convivencia.controller.js';
import { ConvivenciaService } from './convivencia.service.js';
import { EncuentrosController } from './encuentros.controller.js';
import { EncuentrosService } from './encuentros.service.js';
import {
  EvidenciasConvivenciaController,
  EvidenciasProfesorController,
} from './evidencias.controller.js';
import { ALMACENAMIENTO, EvidenciasService } from './evidencias.service.js';
import { ExpedientesController } from './expedientes.controller.js';
import { ExpedientesService } from './expedientes.service.js';
import { HistorialController } from './historial.controller.js';
import { HistorialService } from './historial.service.js';
import { PasosProtocoloController } from './pasos-protocolo.controller.js';
import { PasosProtocoloService } from './pasos-protocolo.service.js';
import { PlanesController } from './planes.controller.js';
import { PlanesService } from './planes.service.js';
import { ApoderadoController } from './apoderado.controller.js';
import { ApoderadoService } from './apoderado.service.js';
import { ProfesorController } from './profesor.controller.js';
import { ProfesorService } from './profesor.service.js';

// Módulo de Fernando: situaciones de convivencia. Importa AuthModule para usar
// CuentaService y el mismo control de sesión que el resto de la API (PB-127).
// PB-074 (Camilo): el historial del estudiante también vive aquí.
// PB-077 (Camilo): la búsqueda de expedientes de Convivencia.
// PB-053: los casos, que se abren desde una situación.
// PB-066: las evidencias, guardadas con la clave de servicio en el espacio
// privado de Storage, como los archivos de las importaciones (PB-019).
// PB-090 (Camilo): AlertasModule evalúa las reglas de cantidad después de
// registrar una situación.
// PB-061 y PB-062: el plan de intervención del caso y sus acciones.
// PB-063 y PB-064: los encuentros del caso (entrevistas, reuniones y otros).
// PB-055 y PB-056: los pasos del protocolo aplicado y su término.
@Module({
  imports: [AuthModule, AlertasModule],
  controllers: [
    SeguimientosController,
    ApoderadoController,
    ProfesorController,
    ConvivenciaController,
    HistorialController,
    ExpedientesController,
    CasosController,
    PlanesController,
    EncuentrosController,
    PasosProtocoloController,
    EvidenciasConvivenciaController,
    EvidenciasProfesorController,
  ],
  providers: [
    SeguimientosService,
    ApoderadoService,
    ProfesorService,
    ConvivenciaService,
    HistorialService,
    ExpedientesService,
    CasosService,
    PlanesService,
    EncuentrosService,
    PasosProtocoloService,
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
