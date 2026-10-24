import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReglasController } from './reglas.controller.js';
import { ReglasService } from './reglas.service.js';

// Módulo de Camilo: reglas de aviso (PB-089), para los portales de
// administración y de Convivencia. Importa AuthModule para usar CuentaService
// y el control de sesión de PB-127. La evaluación de las reglas y las alertas
// son PB-090 a PB-092.
@Module({
  imports: [AuthModule],
  controllers: [ReglasController],
  providers: [ReglasService],
})
export class ReglasModule {}
