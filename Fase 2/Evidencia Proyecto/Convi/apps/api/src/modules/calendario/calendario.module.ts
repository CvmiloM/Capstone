import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CalendarioController } from './calendario.controller.js';
import { CalendarioService } from './calendario.service.js';
import {
  CalendarioSuscritoController,
  SuscripcionCalendarioController,
} from './suscripcion.controller.js';
import { SuscripcionCalendarioService } from './suscripcion.service.js';

// PB-085 (HU-074): calendario de Convivencia. Lee convi.vw_calendario, que
// reúne actuaciones, compromisos, pasos de protocolo, acciones de intervención
// y actividades del Plan de Gestión, sin guardar copias.
// Refinamientos de Convivencia, sección 5: también entrega el enlace privado
// para suscribirlo desde Google Calendar.
@Module({
  imports: [AuthModule],
  controllers: [
    CalendarioController,
    SuscripcionCalendarioController,
    CalendarioSuscritoController,
  ],
  providers: [CalendarioService, SuscripcionCalendarioService],
})
export class CalendarioModule {}
