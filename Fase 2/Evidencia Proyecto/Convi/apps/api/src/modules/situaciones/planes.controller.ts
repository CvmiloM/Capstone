import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { PlanesService } from './planes.service.js';

// PB-061 y PB-062 (HU-054): plan de intervención del caso y sus acciones.
// Como en los casos, solo entra una cuenta CONVIVENCIA activa con segundo
// factor (PB-009). El plan y sus acciones se ven en GET /convivencia/casos/:id.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class PlanesController {
  constructor(@Inject(PlanesService) private readonly planes: PlanesService) {}

  // El cuerpo trae { objetivo, estado, protocolo_caso_id }; responde 201 con el id.
  @Post('casos/:id/planes')
  crearPlan(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.planes.crearPlan(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { estado_nuevo, motivo, version }.
  @Post('planes/:id/estado')
  cambiarEstadoPlan(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.planes.cambiarEstadoPlan(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { descripcion, persona_responsable_id, vence_dia }.
  @Post('planes/:id/acciones')
  agregarAccion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.planes.agregarAccion(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { estado_nuevo, notas, completado_dia, motivo, version }.
  @Post('acciones-plan/:id/estado')
  avanzarAccion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.planes.avanzarAccion(peticion.sesion, id, cuerpo);
  }

  // CA4: el cuerpo trae { descripcion, persona_responsable_id, vence_dia,
  // notas, completado_dia, motivo, version }.
  @Patch('acciones-plan/:id')
  corregirAccion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.planes.corregirAccion(peticion.sesion, id, cuerpo);
  }
}
