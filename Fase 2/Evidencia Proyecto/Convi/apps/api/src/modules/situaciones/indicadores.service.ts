import { Inject, Injectable } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { CONSULTA_INDICADORES, validarFiltrosIndicadores } from './indicadores.js';

@Injectable()
export class IndicadoresService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  consultar(sesion: Sesion, entrada: Record<string, unknown>) {
    const filtros = validarFiltrosIndicadores(entrada);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        const { rows } = await db.query(CONSULTA_INDICADORES, [
          filtros.desde, filtros.hasta, filtros.curso, filtros.categoria,
        ]);
        return { ...rows[0], filtros: { curso: filtros.curso, categoria: filtros.categoria } };
      },
    );
  }
}
