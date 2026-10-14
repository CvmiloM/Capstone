import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  type Ciclo,
  errorDeCampos,
  validarActivo,
  validarDatosNivel,
} from './nivel-educativo.js';

// PB-014 (HU-012): niveles educativos de la escuela del administrador. La
// escuela nunca viene del navegador: CuentaService.operar fija la escuela de
// la sesión y la seguridad por fila oculta las demás (PB-141).
const PERFILES: Perfil[] = ['ADMIN'];

export type NivelEducativo = {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  ciclo: Ciclo;
  tramo: string;
  activo: boolean;
  /** Cursos de cualquier año que usan el nivel. */
  cursos: number;
};

type ErrorPostgres = { code?: string; constraint?: string };

// Decisión del PO: si el nivel ya tiene cursos, el código, el ciclo y el tramo
// quedan fijos, para no reagrupar cursos pasados en la analítica (CA3). El
// nombre y el orden se pueden cambiar siempre.
const FIJOS_CON_CURSOS = ['codigo', 'ciclo', 'tramo'] as const;

const COLUMNAS = `
  n.id, n.codigo, n.nombre, n.orden, n.ciclo, n.tramo, n.activo,
  (SELECT count(*) FROM convi.cursos c
    WHERE c.nivel_id = n.id)::int AS cursos`;

@Injectable()
export class NivelesService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // En el orden que definió la escuela.
  listar(sesion: Sesion): Promise<NivelEducativo[]> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<NivelEducativo>(
        `SELECT ${COLUMNAS} FROM convi.niveles_educativos n ORDER BY n.orden`,
      );
      return resultado.rows;
    });
  }

  // Un nivel nuevo queda activo y se puede usar de inmediato en cursos nuevos.
  crear(sesion: Sesion, cuerpo: unknown): Promise<NivelEducativo> {
    const datos = validarDatosNivel(cuerpo);
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<NivelEducativo>(
        `INSERT INTO convi.niveles_educativos AS n
           (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5)
         RETURNING ${COLUMNAS}`,
        [datos.codigo, datos.nombre, datos.orden, datos.ciclo, datos.tramo],
      );
      return resultado.rows[0];
    });
  }

  editar(sesion: Sesion, id: string, cuerpo: unknown): Promise<NivelEducativo> {
    const datos = validarDatosNivel(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await bloquear(db, id);
      if (actual.cursos > 0) {
        const errores: Record<string, string> = {};
        for (const campo of FIJOS_CON_CURSOS) {
          if (datos[campo] !== actual[campo])
            errores[campo] =
              'No se puede cambiar porque el nivel ya tiene cursos.';
        }
        if (Object.keys(errores).length > 0) throw errorDeCampos(errores);
      }
      const resultado = await db.query<NivelEducativo>(
        `UPDATE convi.niveles_educativos AS n
         SET codigo = $2, nombre = $3, orden = $4, ciclo = $5, tramo = $6
         WHERE n.id = $1
         RETURNING ${COLUMNAS}`,
        [id, datos.codigo, datos.nombre, datos.orden, datos.ciclo, datos.tramo],
      );
      return resultado.rows[0];
    });
  }

  // CA2: un nivel no se borra. Desactivarlo lo saca de los cursos nuevos (la
  // base lo rechaza al crear un curso) y los cursos que ya lo usan lo conservan.
  // Decisión del PO: un nivel desactivado se puede volver a activar.
  cambiarActivo(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<NivelEducativo> {
    const activo = validarActivo(cuerpo);
    return this.operar(sesion, async (db) => {
      await bloquear(db, id);
      // La base guarda el antes y el después del cambio en eventos_auditoria.
      const resultado = await db.query<NivelEducativo>(
        `UPDATE convi.niveles_educativos AS n
         SET activo = $2
         WHERE n.id = $1
         RETURNING ${COLUMNAS}`,
        [id, activo],
      );
      return resultado.rows[0];
    });
  }

  // Todas las rutas son del administrador y traducen igual los errores del modelo.
  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        try {
          return await trabajo(db);
        } catch (error) {
          throw traducirError(error);
        }
      },
    );
  }
}

// Bloquea el nivel hasta el final de la operación, para que dos cambios
// simultáneos sobre el mismo nivel no se pisen.
async function bloquear(db: PoolClient, id: string) {
  const resultado = await db.query<NivelEducativo>(
    `SELECT ${COLUMNAS} FROM convi.niveles_educativos n WHERE n.id = $1 FOR UPDATE OF n`,
    [id],
  );
  if (resultado.rows.length === 0)
    throw new NotFoundException('No encontramos ese nivel educativo.');
  return resultado.rows[0];
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint } = (error ?? {}) as ErrorPostgres;
  // CA1: el código y el orden no se repiten dentro de la escuela.
  if (
    code === '23505' &&
    constraint === 'niveles_educativos_establecimiento_id_codigo_key'
  )
    return errorDeCampos({
      codigo: 'Ese código ya lo usa otro nivel de tu escuela.',
    });
  if (
    code === '23505' &&
    constraint === 'niveles_educativos_establecimiento_id_orden_key'
  )
    return errorDeCampos({
      orden:
        'Ese orden ya lo usa otro nivel de tu escuela. Usa un número libre.',
    });
  // Otra persona cambió este mismo nivel mientras se guardaba.
  if (code === '40001')
    return new ConflictException(
      'El nivel cambió mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}