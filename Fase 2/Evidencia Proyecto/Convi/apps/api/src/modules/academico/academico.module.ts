import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AniosController } from './anios.controller.js';
import { AniosService } from './anios.service.js';
import { AsignacionesController } from './asignaciones.controller.js';
import { AsignacionesService } from './asignaciones.service.js';
import { CursosController } from './cursos.controller.js';
import { CursosService } from './cursos.service.js';
import { NivelesController } from './niveles.controller.js';
import { NivelesService } from './niveles.service.js';

// Módulo de Camilo: configuración académica del administrador. Tiene los años
// académicos (PB-013), los niveles educativos (PB-014) y los cursos con sus
// profesores (PB-015). Importa AuthModule para usar CuentaService y el control
// de sesión de PB-127.
@Module({
  imports: [AuthModule],
  controllers: [
    AniosController,
    NivelesController,
    CursosController,
    AsignacionesController,
  ],
  providers: [AniosService, NivelesService, CursosService, AsignacionesService],
})
export class AcademicoModule {}