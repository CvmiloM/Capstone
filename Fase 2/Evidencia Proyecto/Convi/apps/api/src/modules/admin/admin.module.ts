import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContextoAdminController } from './contexto.controller.js';
import { ContextoAdminService } from './contexto.service.js';
import { EstablecimientoController } from './establecimiento.controller.js';
import { EstablecimientoService } from './establecimiento.service.js';
import { GuiaAdminController } from './guia.controller.js';
import { GuiaAdminService } from './guia.service.js';
import { ResumenAdminController } from './resumen.controller.js';
import { ResumenAdminService } from './resumen.service.js';

// Datos generales del portal de administración: su encabezado, el resumen
// de la escuela (PB-040) y la guía inicial (PB-032, PB-034 y PB-038).
// Importa AuthModule para usar CuentaService y el control de sesión de PB-127.
@Module({
  imports: [AuthModule],
  controllers: [
    ContextoAdminController,
    EstablecimientoController,
    GuiaAdminController,
    ResumenAdminController,
  ],
  providers: [
    ContextoAdminService,
    EstablecimientoService,
    GuiaAdminService,
    ResumenAdminService,
  ],
})
export class AdminModule {}
