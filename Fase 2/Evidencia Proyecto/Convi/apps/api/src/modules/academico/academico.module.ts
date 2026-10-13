import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AniosController } from './anios.controller.js';
import { AniosService } from './anios.service.js';

// Módulo de Camilo: configuración académica del administrador. Parte con los
// años académicos (PB-013); aquí también irán niveles y cursos (PB-014 y PB-015).
// Importa AuthModule para usar CuentaService y el control de sesión de PB-127.
@Module({
  imports: [AuthModule],
  controllers: [AniosController],
  providers: [AniosService],
})
export class AcademicoModule {}