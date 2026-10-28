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
import { AuditoriaService } from './auditoria.service.js';

@Controller('admin/auditoria')
@PerfilesPermitidos('ADMIN')
export class AuditoriaAdminController {
  constructor(
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  @Get()
  listar(@Req() peticion: PeticionConSesion, @Query() consulta: unknown) {
    return this.auditoria.administrativa(peticion.sesion, consulta);
  }
}

@Controller('convivencia/casos')
@PerfilesPermitidos('CONVIVENCIA')
export class HistorialCasoController {
  constructor(
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
  ) {}

  @Get(':id/historial')
  consultar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('antes') antes: unknown,
  ) {
    return this.auditoria.cronologia(peticion.sesion, id, antes);
  }
}
