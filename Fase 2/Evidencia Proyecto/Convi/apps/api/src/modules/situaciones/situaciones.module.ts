import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfesorController } from './profesor.controller.js';
import { ProfesorService } from './profesor.service.js';

// Módulo de Fernando: situaciones de convivencia. Importa AuthModule para usar
// CuentaService y el mismo control de sesión que el resto de la API (PB-127).
@Module({
  imports: [AuthModule],
  controllers: [ProfesorController],
  providers: [ProfesorService],
})
export class SituacionesModule {}
