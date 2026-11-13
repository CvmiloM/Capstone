import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ApoderadoService } from './apoderado.service.js';
import { disposicionDescarga } from './archivo-evidencia.js';
import { EvidenciasService } from './evidencias.service.js';

@Controller('apoderado')
@PerfilesPermitidos('APODERADO')
export class ApoderadoController {
  constructor(
    @Inject(ApoderadoService) private readonly portal: ApoderadoService,
    @Inject(EvidenciasService) private readonly evidencias: EvidenciasService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  listar(
    @Req() p: PeticionConSesion,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.listar(p.sesion, consulta);
  }

  @Get('estudiantes/:estudianteId/casos')
  @Header('Cache-Control', 'private, no-store')
  casos(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.casos(p.sesion, estudianteId, consulta);
  }

  // Portal del pupilo: ficha y listas de solo lectura. Todas pasan por
  // CuentaService.operar con el estudiante, igual que sus casos.
  @Get('estudiantes/:estudianteId/resumen')
  @Header('Cache-Control', 'private, no-store')
  resumen(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
  ) {
    return this.portal.resumen(p.sesion, estudianteId);
  }

  @Get('estudiantes/:estudianteId/historial')
  @Header('Cache-Control', 'private, no-store')
  historial(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.historial(p.sesion, estudianteId, consulta);
  }

  @Get('estudiantes/:estudianteId/documentos')
  @Header('Cache-Control', 'private, no-store')
  documentos(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.documentos(p.sesion, estudianteId, consulta);
  }

  @Get('estudiantes/:estudianteId/reuniones')
  @Header('Cache-Control', 'private, no-store')
  reuniones(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.reuniones(p.sesion, estudianteId, consulta);
  }

  @Get('estudiantes/:estudianteId/comunicaciones')
  @Header('Cache-Control', 'private, no-store')
  comunicaciones(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.comunicaciones(p.sesion, estudianteId, consulta);
  }

  @Get('estudiantes/:estudianteId/casos/:casoId')
  @Header('Cache-Control', 'private, no-store')
  detalle(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Param('casoId', ParseUUIDPipe) casoId: string,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.portal.detalle(p.sesion, estudianteId, casoId, consulta);
  }

  @Get('estudiantes/:estudianteId/casos/:casoId/evidencias/:id/archivo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async descargar(
    @Req() p: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Param('casoId', ParseUUIDPipe) casoId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const archivo = await this.evidencias.descargarApoderado(
      p.sesion,
      estudianteId,
      casoId,
      id,
    );
    return new StreamableFile(archivo.contenido, {
      type: archivo.mime,
      disposition: disposicionDescarga(archivo.nombre),
      length: archivo.contenido.length,
    });
  }
}
