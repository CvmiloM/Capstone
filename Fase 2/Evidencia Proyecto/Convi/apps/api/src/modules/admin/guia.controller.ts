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

// PB-032 (HU-025), PB-033 (HU-026), PB-034 (HU-027), PB-036 (HU-029) y PB-038
// (HU-031): guía inicial del administrador. Solo entra una cuenta ADMIN activa
// con el segundo factor completo.
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

  // PB-036: deja Listo el paso Estudiantes si ya hay estudiantes confirmados
  // por importación. Cuerpo: version.
  @Post('estudiantes')
  terminarEstudiantes(
    @Req() peticion: PeticionConSesion,
    @Body() cuerpo: unknown,
  ) {
    return this.guia.terminarEstudiantes(peticion.sesion, cuerpo);
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
