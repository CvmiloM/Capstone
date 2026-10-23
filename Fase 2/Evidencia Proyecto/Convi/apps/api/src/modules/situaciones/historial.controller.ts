import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { HistorialService } from './historial.service.js';

// PB-074 (HU-064): historial de los estudiantes en el portal de Convivencia.
// Solo entra una cuenta CONVIVENCIA activa con segundo factor (PB-009).
@Controller('convivencia/estudiantes')
@PerfilesPermitidos('CONVIVENCIA')
export class HistorialController {
  constructor(
    @Inject(HistorialService) private readonly historial: HistorialService,
  ) {}

  // ?buscar=perez&pagina=2; ambos opcionales.
  @Get()
  buscar(
    @Req() peticion: PeticionConSesion,
    @Query('buscar') buscar: unknown,
    @Query('pagina') pagina: unknown,
  ) {
    return this.historial.buscar(peticion.sesion, buscar, pagina);
  }

  // ?estado=SITUACION:ANTECEDENTE&desde=2025-03-01&hasta=2025-12-31&orden=asc;
  // todos opcionales (CA3).
  @Get(':id/historial')
  historialDe(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('estado') estado: unknown,
    @Query('desde') desde: unknown,
    @Query('hasta') hasta: unknown,
    @Query('orden') orden: unknown,
  ) {
    return this.historial.historial(peticion.sesion, id, {
      estado,
      desde,
      hasta,
      orden,
    });
  }
}