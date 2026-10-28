import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrientacionController } from './orientacion.controller.js';
import { OrientacionService } from './orientacion.service.js';

// Módulo de Camilo: orientación con IA dentro de un caso (PB-120 y PB-121), para
// el portal de Convivencia. Reutiliza la búsqueda y la generación de normativa.
@Module({
  imports: [AuthModule],
  controllers: [OrientacionController],
  providers: [OrientacionService],
})
export class OrientacionModule {}
