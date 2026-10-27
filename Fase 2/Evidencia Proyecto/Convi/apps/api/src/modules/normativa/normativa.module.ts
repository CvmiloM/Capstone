import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NormativaController } from './normativa.controller.js';
import { NormativaService } from './normativa.service.js';

// Módulo de Camilo: consulta del reglamento con IA (PB-117 a PB-119), para el portal
// de Convivencia. Usa convi-ia (apps/ia) para los embeddings y para redactar.
@Module({
  imports: [AuthModule],
  controllers: [NormativaController],
  providers: [NormativaService],
})
export class NormativaModule {}
