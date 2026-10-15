import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriasController } from './categorias.controller.js';
import { CategoriasService } from './categorias.service.js';

// Módulo de Camilo: catálogo de categorías de situaciones (PB-030), para los
// portales de administración y de Convivencia. Importa AuthModule para usar
// CuentaService y el control de sesión de PB-127.
@Module({
  imports: [AuthModule],
  controllers: [CategoriasController],
  providers: [CategoriasService],
})
export class CategoriasModule {}