import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { CasosService } from './casos.service.js';
import { leerSeccionCaso } from './seccion-caso.js';

// PB-053: casos del portal de Convivencia. El decorador de la clase aplica a
// todas las rutas: solo entra una cuenta CONVIVENCIA activa con segundo
// factor (PB-009).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class CasosController {
  constructor(@Inject(CasosService) private readonly casos: CasosService) {}

  @Get('casos')
  listar(@Req() peticion: PeticionConSesion) {
    return this.casos.listar(peticion.sesion);
  }

  // ?seccion= trae solo lo que muestra esa pestaña de la ficha (seccion-caso.ts).
  @Get('casos/:id')
  detalle(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('seccion') seccion: unknown,
  ) {
    return this.casos.detalle(peticion.sesion, id, leerSeccionCaso(seccion));
  }

  // PB-152: el cuerpo trae { estado_nuevo, motivo, movimiento_anterior_id };
  // responde 201 con el id del caso y su estado nuevo.
  @Post('casos/:id/estado')
  cambiarEstado(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.cambiarEstado(peticion.sesion, id, cuerpo);
  }

  // PB-054: el cuerpo trae { motivo, resumen_cierre, justificacion_pendientes,
  // evidencia_cierre_id, movimiento_anterior_id }; responde 201 con el id.
  @Post('casos/:id/cierre')
  cerrar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.cerrar(peticion.sesion, id, cuerpo);
  }

  // PB-082: el cuerpo trae { version_protocolo_id, fundamento }.
  @Post('casos/:id/protocolos')
  aplicarProtocolo(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.aplicarProtocolo(peticion.sesion, id, cuerpo);
  }

  // PB-082 (HU-071 CA2): el cuerpo trae { aplicabilidad, modo_revision,
  // fundamento, version_protocolo_id, referencias }, como en PB-155.
  @Post('casos/:id/revisiones-normativas')
  registrarRevisionNormativa(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.registrarRevisionNormativa(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { titulo, resumen, fecha_inicio, categoria_principal_id,
  // responsable_id, justificacion_independiente, revision_anterior_id };
  // responde 201 con el id y el código del caso.
  @Post('situaciones/:id/caso')
  crearDesdeSituacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.crearDesdeSituacion(peticion.sesion, id, cuerpo);
  }

  // PB-052: el cuerpo trae { caso_id, fundamento, revision_anterior_id };
  // responde 201 con el id y el código del caso al que quedó vinculada.
  @Post('situaciones/:id/vinculacion')
  vincularSituacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.vincularSituacion(peticion.sesion, id, cuerpo);
  }
}
