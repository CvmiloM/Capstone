import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CalendarioController } from './calendario.controller.js';
import { CalendarioService } from './calendario.service.js';

// PB-085 (HU-074): calendario de Convivencia. Lee convi.vw_calendario, que
// reúne actuaciones, compromisos, pasos de protocolo, acciones de intervención
// y actividades del Plan de Gestión, sin guardar copias.
@Module({
  imports: [AuthModule],
  controllers: [CalendarioController],
  providers: [CalendarioService],
})
export class CalendarioModule {}
