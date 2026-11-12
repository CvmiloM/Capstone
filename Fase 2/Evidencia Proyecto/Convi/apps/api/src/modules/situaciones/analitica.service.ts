import { Inject, Injectable } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  armarAnalitica,
  CONSULTA_ANALITICA,
  type FilaAnalitica,
  validarFiltrosAnalitica,
} from './analitica.js';

/**
 * Analítica de Convivencia: una sola consulta de solo lectura con la cuenta de
 * Convivencia y la escuela de la sesión, la seguridad por fila decide qué se
 * cuenta y no sale ningún registro individual.
 */
@Injectable()
export class AnaliticaService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  consultar(sesion: Sesion, entrada: Record<string, unknown>) {
    const filtros = validarFiltrosAnalitica(entrada);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        const { rows } = await db.query<FilaAnalitica>(CONSULTA_ANALITICA, [
          filtros.categoria,
        ]);
        return armarAnalitica(rows[0]);
      },
    );
  }
}
