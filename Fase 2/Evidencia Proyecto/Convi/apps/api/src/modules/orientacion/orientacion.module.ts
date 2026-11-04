import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BorradoresController } from './borradores.controller.js';
import { BorradoresService } from './borradores.service.js';
import { OrientacionController } from './orientacion.controller.js';
import { OrientacionService } from './orientacion.service.js';

// Módulo de Camilo: orientación con IA dentro de un caso (PB-120 y PB-121), para
// el portal de Convivencia. Reutiliza la búsqueda y la generación de normativa.
// PB-125 y PB-126: borradores de acta y de informe de caso con IA.
@Module({
  imports: [AuthModule],
  controllers: [OrientacionController, BorradoresController],
  providers: [OrientacionService, BorradoresService],
})
export class OrientacionModule {}
