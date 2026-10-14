import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AniosController } from './anios.controller.js';
import { AniosService } from './anios.service.js';
import { NivelesController } from './niveles.controller.js';
import { NivelesService } from './niveles.service.js';

// Módulo de Camilo: configuración académica del administrador. Tiene los años
// académicos (PB-013) y los niveles educativos (PB-014); aquí también irán los
// cursos (PB-015). Importa AuthModule para usar CuentaService y el control de
// sesión de PB-127.
@Module({
  imports: [AuthModule],
  controllers: [AniosController, NivelesController],
  providers: [AniosService, NivelesService],
})
export class AcademicoModule {}