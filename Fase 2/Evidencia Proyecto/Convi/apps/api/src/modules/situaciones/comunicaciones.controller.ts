import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import type { ArchivoSubido } from './archivo-evidencia.js';
import { ComunicacionesService } from './comunicaciones.service.js';
import { CARGA, enviarArchivo } from './evidencias.controller.js';
import { EvidenciasService } from './evidencias.service.js';

// PB-067 (HU-058): comunicaciones del caso. Como en los casos, solo entra una
// cuenta CONVIVENCIA activa con segundo factor (PB-009). Se ven en
// GET /convivencia/casos/:id.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class ComunicacionesController {
  constructor(
    @Inject(ComunicacionesService)
    private readonly comunicaciones: ComunicacionesService,
    @Inject(EvidenciasService) private readonly evidencias: EvidenciasService,
  ) {}

  // Formulario multipart con tipo, persona_destinataria_id o
  // destinatario_externo, resumen, ocurrido_en y archivo opcional. Responde
  // 201 con el id y si quedó registrada una advertencia (CA5).
  @Post('casos/:id/comunicaciones')
  @UseInterceptors(CARGA)
  registrar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.comunicaciones.registrar(peticion.sesion, id, cuerpo, archivo);
  }

  // CA2: la descarga del respaldo vuelve a comprobar el permiso.
  @Get('comunicaciones/:id/respaldo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  descargarRespaldo(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return enviarArchivo(
      this.evidencias.descargarRespaldo(peticion.sesion, id),
    );
  }
}
