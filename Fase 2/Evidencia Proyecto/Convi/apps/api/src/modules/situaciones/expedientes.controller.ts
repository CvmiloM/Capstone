import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ExpedientesService } from './expedientes.service.js';

// PB-077 (HU-067): búsqueda de expedientes del portal de Convivencia. Solo
// entra una cuenta CONVIVENCIA activa con segundo factor (PB-009).
@Controller('convivencia/expedientes')
@PerfilesPermitidos('CONVIVENCIA')
export class ExpedientesController {
  constructor(
    @Inject(ExpedientesService)
    private readonly expedientes: ExpedientesService,
  ) {}

  // ?codigo=SIT-2026&estudiante=perez&estado=CASO:REABIERTO&desde=2026-03-01
  // &hasta=2026-06-30&pagina=2; todos opcionales.
  @Get()
  buscar(
    @Req() peticion: PeticionConSesion,
    @Query('codigo') codigo: unknown,
    @Query('estudiante') estudiante: unknown,
    @Query('estado') estado: unknown,
    @Query('desde') desde: unknown,
    @Query('hasta') hasta: unknown,
    @Query('pagina') pagina: unknown,
  ) {
    return this.expedientes.buscar(peticion.sesion, {
      codigo,
      estudiante,
      estado,
      desde,
      hasta,
      pagina,
    });
  }
}