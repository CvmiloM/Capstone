import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { GuiaAdminService } from './guia.service.js';

// PB-032 a PB-039 (HU-025 a HU-032): guía inicial del administrador. Solo
// entra una cuenta ADMIN activa con el segundo factor completo.
@Controller('admin/guia')
@PerfilesPermitidos('ADMIN')
export class GuiaAdminController {
  constructor(
    @Inject(GuiaAdminService) private readonly guia: GuiaAdminService,
  ) {}

  @Get()
  consultar(@Req() peticion: PeticionConSesion) {
    return this.guia.consultar(peticion.sesion);
  }

  // PB-039: cifras del paso Resumen y fin.
  @Get('resumen')
  resumen(@Req() peticion: PeticionConSesion) {
    return this.guia.resumen(peticion.sesion);
  }

  // PB-039: termina la guía y guarda la fecha; repetirlo no la cambia.
  // Cuerpo: version.
  @Post('fin')
  terminar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.guia.terminar(peticion.sesion, cuerpo);
  }

  // Cuerpo: version.
  @Post('inicio')
  iniciar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.guia.iniciar(peticion.sesion, cuerpo);
  }

  // Cuerpo: accion (GUARDAR u OMITIR), metodo, otro, mejorar y version.
  @Post('bienvenida')
  guardarBienvenida(
    @Req() peticion: PeticionConSesion,
    @Body() cuerpo: unknown,
  ) {
    return this.guia.guardarBienvenida(peticion.sesion, cuerpo);
  }

  // PB-034: anio, fecha_inicio, fecha_fin, activar, niveles ({ clave,
  // secciones }) y version. Responde cuánto creó y cuánto ya existía.
  @Post('cursos')
  guardarCursos(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.guia.guardarCursos(peticion.sesion, cuerpo);
  }

  // PB-033: deja Listo el paso Equipo si ya hay cuentas de Convivencia o de
  // profesores. Cuerpo: version.
  @Post('equipo')
  terminarEquipo(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.guia.terminarEquipo(peticion.sesion, cuerpo);
  }

  // PB-035: deja Listo el paso Reglamento si ya hay una versión del RICE
  // cargada. Cuerpo: version.
  @Post('reglamento')
  terminarReglamento(
    @Req() peticion: PeticionConSesion,
    @Body() cuerpo: unknown,
  ) {
    return this.guia.terminarReglamento(peticion.sesion, cuerpo);
  }

  // PB-036: deja Listo el paso Estudiantes si ya hay estudiantes confirmados
  // por importación. Cuerpo: version.
  @Post('estudiantes')
  terminarEstudiantes(
    @Req() peticion: PeticionConSesion,
    @Body() cuerpo: unknown,
  ) {
    return this.guia.terminarEstudiantes(peticion.sesion, cuerpo);
  }

  // PB-037: deja Listo el paso Categorías y reglas si ya hay una regla en
  // Borrador o Activa. Cuerpo: version.
  @Post('reglas')
  terminarReglas(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.guia.terminarReglas(peticion.sesion, cuerpo);
  }

  // Cuerpo: version.
  @Post('pasos/:paso/omision')
  omitirPaso(
    @Req() peticion: PeticionConSesion,
    @Param('paso') paso: string,
    @Body() cuerpo: unknown,
  ) {
    return this.guia.omitirPaso(peticion.sesion, paso, cuerpo);
  }
}
