import { Inject, Injectable } from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  armarResumen,
  CONSULTA_RESUMEN,
  type FilaResumen,
  type ResumenEscuela,
} from './resumen.js';

// PB-040 (HU-033): resumen de la escuela para el administrador. CA4: solo
// entra una cuenta ADMIN activa con segundo factor y escuela activa; los
// demás perfiles reciben 403 antes de consultar nada.
const PERFILES: Perfil[] = ['ADMIN'];

@Injectable()
export class ResumenAdminService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  consultar(sesion: Sesion): Promise<ResumenEscuela> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<FilaResumen>(CONSULTA_RESUMEN);
        return armarResumen(resultado.rows[0]);
      },
    );
  }
}
