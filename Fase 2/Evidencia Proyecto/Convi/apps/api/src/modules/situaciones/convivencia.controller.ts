import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ConvivenciaService } from './convivencia.service.js';

// PB-043, PB-044, PB-045, PB-046, PB-047, PB-048, PB-051 y PB-155: rutas del portal de Convivencia. El decorador de la clase aplica a
// todas: solo entra una cuenta CONVIVENCIA activa con segundo factor (PB-009).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class ConvivenciaController {
  constructor(
    @Inject(ConvivenciaService)
    private readonly convivencia: ConvivenciaService,
  ) {}

  // PB-043: categorías, cursos con sus estudiantes, funcionarios y apoderados
  // para el formulario de registro.
  @Get('registro/opciones')
  opcionesRegistro(
    @Req() peticion: PeticionConSesion,
    @Query('liviano') liviano?: string,
  ) {
    return this.convivencia.opcionesRegistro(peticion.sesion, liviano === '1');
  }

  @Get('registro/estudiantes')
  buscarEstudiantes(
    @Req() peticion: PeticionConSesion,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.convivencia.buscarEstudiantes(peticion.sesion, consulta);
  }

  // PB-043: el cuerpo se valida en el servicio; responde 201 con el código.
  @Post('situaciones')
  registrar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.convivencia.registrar(peticion.sesion, cuerpo);
  }

  // PB-075 (Camilo): situación de un año anterior, con los mismos datos y una
  // conclusión; queda como antecedente y responde 201 con el código.
  @Post('situaciones/historicas')
  registrarHistorica(
    @Req() peticion: PeticionConSesion,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.registrar(peticion.sesion, cuerpo, {
      historico: true,
    });
  }

  // ?estado=NUEVA&urgencia=URGENTE; ambos opcionales.
  @Get('situaciones')
  bandeja(
    @Req() peticion: PeticionConSesion,
    @Query('estado') estado: unknown,
    @Query('urgencia') urgencia: unknown,
  ) {
    return this.convivencia.bandeja(peticion.sesion, estado, urgencia);
  }

  @Get('situaciones/:id')
  situacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.convivencia.situacion(peticion.sesion, id);
  }

  // Cambia el estado de una situación ya existente: responde 200, no 201.
  @Post('situaciones/:id/revision')
  @HttpCode(200)
  iniciarRevision(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.convivencia.iniciarRevision(peticion.sesion, id);
  }

  // El cuerpo trae { urgencia, urgencia_anterior, motivo }.
  @Patch('situaciones/:id/urgencia')
  cambiarUrgencia(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.cambiarUrgencia(peticion.sesion, id, cuerpo);
  }

  // PB-046: el cuerpo trae { responsable_id, responsable_anterior_id, motivo }.
  @Patch('situaciones/:id/responsable')
  asignarResponsable(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.asignarResponsable(peticion.sesion, id, cuerpo);
  }

  // PB-047, PB-048 y PB-051: el cuerpo trae { resultado, fundamento,
  // motivo_descarte, codigo_original, revision_anterior_id }; responde 201.
  @Post('situaciones/:id/decisiones')
  registrarDecision(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.registrarDecision(peticion.sesion, id, cuerpo);
  }

  // PB-155: el cuerpo trae { aplicabilidad, modo_revision, fundamento,
  // version_protocolo_id, referencias }; responde 201 con la revisión creada.
  @Post('situaciones/:id/revisiones-normativas')
  registrarRevisionNormativa(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.registrarRevisionNormativa(
      peticion.sesion,
      id,
      cuerpo,
    );
  }

  // PB-045: el cuerpo trae { pregunta }; responde 201 con la aclaración creada.
  @Post('situaciones/:id/aclaraciones')
  pedirAclaracion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.pedirAclaracion(peticion.sesion, id, cuerpo);
  }
}
