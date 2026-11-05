import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  prepararComparacion,
  TEXTO_SIN_MOVIMIENTO,
  type ComparacionParaExplicar,
} from '../orientacion/explicacion-ia.js';
import {
  explicarConIA,
  type ExplicacionIA,
} from '../orientacion/explicar-con-ia.js';
import {
  CONSULTA_INDICADORES,
  OPCIONES_INDICADORES,
  validarFiltrosIndicadores,
} from './indicadores.js';
import { leerIndicadores } from './calculo-indicadores.js';

type Opcion = { id: string; nombre: string };

@Injectable()
export class IndicadoresService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  consultar(sesion: Sesion, entrada: Record<string, unknown>) {
    const filtros = validarFiltrosIndicadores(entrada);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        if (!filtros.desde && !filtros.hasta) {
          const { rows } = await db.query(OPCIONES_INDICADORES);
          return rows[0];
        }
        return leerIndicadores(db, filtros);
      },
    );
  }

  // PB-123 (HU-104): la IA explica la comparación entre períodos con los mismos
  // valores que muestra el panel, recalculados en el servidor con los filtros
  // recibidos. Si todo es cero no se llama a la IA.
  explicarComparacion(
    sesion: Sesion,
    entrada: unknown,
  ): Promise<ExplicacionIA> {
    const datos = (
      typeof entrada === 'object' && entrada !== null ? entrada : {}
    ) as Record<string, unknown>;
    const filtros = validarFiltrosIndicadores(datos);
    if (!filtros.desde || !filtros.hasta)
      throw new BadRequestException(
        'Elige un período antes de pedir la explicación',
      );
    return explicarConIA(this.cuentas, sesion, {
      tipo: 'COMPARACION',
      alertaId: null,
      preparar: async (db) => {
        const { rows } = await db.query<
          Omit<ComparacionParaExplicar, 'curso' | 'categoria'> & {
            opciones: { cursos: Opcion[]; categorias: Opcion[] };
          }
        >(CONSULTA_INDICADORES, [
          filtros.desde,
          filtros.hasta,
          filtros.curso,
          filtros.categoria,
          null,
          null,
          null,
        ]);
        const fila = rows[0];
        const nombre = (lista: Opcion[], id: string | null) =>
          id
            ? (lista.find((o) => o.id === id)?.nombre ?? 'el filtro elegido')
            : null;
        const preparado = prepararComparacion({
          desde: fila.desde,
          hasta: fila.hasta,
          comparacion: fila.comparacion,
          curso: nombre(fila.opciones.cursos, filtros.curso),
          categoria: nombre(fila.opciones.categorias, filtros.categoria),
        });
        return {
          ...preparado,
          textoSinIA: preparado.sinMovimiento ? TEXTO_SIN_MOVIMIENTO : null,
        };
      },
    });
  }
}
