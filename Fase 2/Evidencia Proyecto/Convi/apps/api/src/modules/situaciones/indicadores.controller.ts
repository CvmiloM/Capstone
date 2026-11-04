import { Body, Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
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

  // PB-123 (HU-104). Cuerpo: desde, hasta y, si se eligieron, curso y categoría.
  @Post('comparacion/explicacion')
  explicarComparacion(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.indicadores.explicarComparacion(peticion.sesion, cuerpo);
  }
}
