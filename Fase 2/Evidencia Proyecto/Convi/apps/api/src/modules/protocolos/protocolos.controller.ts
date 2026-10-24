import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ProtocolosService } from './protocolos.service.js';

// PB-081 y PB-083: catálogo de protocolos del portal de Convivencia. Solo
// entra una cuenta CONVIVENCIA activa con segundo factor (PB-009).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class ProtocolosController {
  constructor(
    @Inject(ProtocolosService) private readonly protocolos: ProtocolosService,
  ) {}

  @Get('protocolos')
  listar(@Req() peticion: PeticionConSesion) {
    return this.protocolos.listar(peticion.sesion);
  }

  // El cuerpo trae { codigo, nombre }; responde con el protocolo y su
  // versión 1 en Borrador.
  @Post('protocolos')
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.protocolos.crear(peticion.sesion, cuerpo);
  }

  @Get('protocolos/:id')
  detalle(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.protocolos.detalle(peticion.sesion, id);
  }

  @Post('protocolos/:id/versiones')
  nuevaVersion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.protocolos.nuevaVersion(peticion.sesion, id);
  }

  @Get('versiones-protocolo/:id')
  detalleVersion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.protocolos.detalleVersion(peticion.sesion, id);
  }

  // El cuerpo trae { version_documento_origen_id, notas }.
  @Patch('versiones-protocolo/:id')
  actualizarVersion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.protocolos.actualizarVersion(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { orden_paso, nombre, descripcion, valor_plazo,
  // unidad_plazo, requiere_evidencia, es_obligatorio }.
  @Post('versiones-protocolo/:id/pasos')
  agregarPaso(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.protocolos.agregarPaso(peticion.sesion, id, cuerpo);
  }

  @Patch('pasos-protocolo/:id')
  editarPaso(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.protocolos.editarPaso(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { vigente_desde }; el revisor y la fecha los pone la base.
  @Post('versiones-protocolo/:id/publicacion')
  publicar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.protocolos.publicar(peticion.sesion, id, cuerpo);
  }
}
