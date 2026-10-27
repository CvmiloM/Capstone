import { Controller, Get, Inject, Req } from '@nestjs/common';
import {
  ConsultaSesion,
  PerfilesPermitidos,
} from '../../common/acceso.decorator.js';
import { PERFILES } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  @Get('zona-horaria')
  @PerfilesPermitidos(...PERFILES)
  zonaHoraria(@Req() peticion: PeticionConSesion) {
    return this.cuentas.operar(
      peticion.sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<{ zona_horaria: string }>(
          'SELECT zona_horaria FROM convi.establecimientos WHERE id = $1',
          [peticion.sesion.establecimiento_id],
        );
        return resultado.rows[0];
      },
    );
  }

  @Get('sesion')
  @ConsultaSesion()
  consultar(@Req() peticion: PeticionConSesion) {
    const sesion = peticion.sesion;
    // PB-144: el login solo necesita perfil y segundo factor; los IDs de escuela
    // y membresía quedan en la sesión interna, no los elige ni necesita el cliente.
    return {
      codigo_perfil: sesion.codigo_perfil,
      requiere_segundo_factor: sesion.requiere_segundo_factor,
      segundo_factor_pendiente:
        sesion.requiere_segundo_factor && sesion.aal !== 'aal2',
    };
  }
}
