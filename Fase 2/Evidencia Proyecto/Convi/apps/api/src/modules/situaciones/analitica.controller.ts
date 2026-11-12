import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { AnaliticaService } from './analitica.service.js';

// Analítica de Convivencia, pestaña de Indicadores e informes. ?categoria= es opcional.
@Controller('convivencia/analitica')
@PerfilesPermitidos('CONVIVENCIA')
export class AnaliticaController {
  constructor(
    @Inject(AnaliticaService) private readonly analitica: AnaliticaService,
  ) {}

  @Get()
  consultar(
    @Req() peticion: PeticionConSesion,
    @Query() filtros: Record<string, unknown>,
  ) {
    return this.analitica.consultar(peticion.sesion, filtros);
  }
}
