import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProtocolosController } from './protocolos.controller.js';
import { ProtocolosAdminController } from './protocolos-admin.controller.js';
import { ProtocolosService } from './protocolos.service.js';

// Módulo de Fernando: protocolos de la escuela (PB-081 y PB-083). Importa
// AuthModule para usar CuentaService y el control de sesión de PB-127.
// Aplicar un protocolo a un caso (PB-082) vive con los casos, en situaciones.
@Module({
  imports: [AuthModule],
  controllers: [ProtocolosController, ProtocolosAdminController],
  providers: [ProtocolosService],
})
export class ProtocolosModule {}
