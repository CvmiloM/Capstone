import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { IndicadoresService } from './indicadores.service.js';

@Controller('convivencia/indicadores')
@PerfilesPermitidos('CONVIVENCIA')
export class IndicadoresController {
  constructor(@Inject(IndicadoresService) private readonly indicadores: IndicadoresService) {}

  @Get()
  consultar(@Req() peticion: PeticionConSesion, @Query() filtros: Record<string, unknown>) {
    return this.indicadores.consultar(peticion.sesion, filtros);
  }
}
