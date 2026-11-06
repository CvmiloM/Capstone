import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { CalendarioService } from './calendario.service.js';

// PB-085 (HU-074): calendario de Convivencia, solo para una cuenta CONVIVENCIA
// activa con segundo factor.
@Controller('convivencia/calendario')
@PerfilesPermitidos('CONVIVENCIA')
export class CalendarioController {
  constructor(
    @Inject(CalendarioService) private readonly calendario: CalendarioService,
  ) {}

  // ?mes=AAAA-MM y ?tipos=ACTUACION,COMPROMISO…, ambos opcionales.
  @Get()
  mes(
    @Req() peticion: PeticionConSesion,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.calendario.mes(peticion.sesion, consulta);
  }
}
