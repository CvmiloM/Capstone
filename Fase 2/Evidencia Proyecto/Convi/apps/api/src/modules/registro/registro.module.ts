import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RegistroController } from './registro.controller.js';
import { RegistroService } from './registro.service.js';

// Módulo de Camilo: registro inicial del establecimiento (PB-002). Importa
// AuthModule para usar CuentaService.operarRegistro (adaptación de PB-127).
@Module({
  imports: [AuthModule],
  controllers: [RegistroController],
  providers: [RegistroService],
})
export class RegistroModule {}