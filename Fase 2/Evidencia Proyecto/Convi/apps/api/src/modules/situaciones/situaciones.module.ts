import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CasosController } from './casos.controller.js';
import { CasosService } from './casos.service.js';
import { ConvivenciaController } from './convivencia.controller.js';
import { ConvivenciaService } from './convivencia.service.js';
import { HistorialController } from './historial.controller.js';
import { HistorialService } from './historial.service.js';
import { ProfesorController } from './profesor.controller.js';
import { ProfesorService } from './profesor.service.js';

// Módulo de Fernando: situaciones de convivencia. Importa AuthModule para usar
// CuentaService y el mismo control de sesión que el resto de la API (PB-127).
// PB-074 (Camilo): el historial del estudiante también vive aquí.
// PB-053: los casos, que se abren desde una situación.
@Module({
  imports: [AuthModule],
  controllers: [
    ProfesorController,
    ConvivenciaController,
    HistorialController,
    CasosController,
  ],
  providers: [
    ProfesorService,
    ConvivenciaService,
    HistorialService,
    CasosService,
  ],
})
export class SituacionesModule {}
