import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AuditoriaAdminController,
  HistorialCasoController,
} from './auditoria.controller.js';
import { AuditoriaService } from './auditoria.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AuditoriaAdminController, HistorialCasoController],
  providers: [AuditoriaService],
})
export class AuditoriaModule {}
