import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContextoAdminController } from './contexto.controller.js';
import { ContextoAdminService } from './contexto.service.js';

// Datos generales del portal de administración (por ahora, su encabezado).
// Importa AuthModule para usar CuentaService y el control de sesión de PB-127.
@Module({
  imports: [AuthModule],
  controllers: [ContextoAdminController],
  providers: [ContextoAdminService],
})
export class AdminModule {}
