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
  type EstadoCategoria,
  errorDeCampos,
  validarCategoria,
  validarEstado,
} from './categoria.js';

// PB-030 (HU-023): catálogo de categorías de la escuela de la sesión.
// Decisión del PO: lo manejan el administrador y Convivencia. La escuela nunca
// viene del navegador: la seguridad por fila oculta las de otras (CA3).
// Las categorías no se borran: convi_backend no tiene permiso de DELETE y la
// API no ofrece esa ruta (CA3).
const PERFILES: Perfil[] = ['ADMIN', 'CONVIVENCIA'];

export type Categoria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** ACTIVO o INACTIVO. */
  estado: EstadoCategoria;
};

// Para comparar nombres sin mayúsculas, tildes ni diéresis.
const comparable = (sql: string) =>
  `lower(translate(${sql}, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu'))`;

const COLUMNAS = `id, nombre, descripcion, estado`;

@Injectable()
export class CategoriasService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Primero las activas y luego las inactivas, cada grupo por nombre.
  listar(sesion: Sesion): Promise<Categoria[]> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<Categoria>(
        `SELECT ${COLUMNAS} FROM convi.categorias_convivencia
         ORDER BY estado = 'ACTIVO' DESC, ${comparable('nombre')}`,
      );
      return resultado.rows;
    });
  }

  // CA1: la categoría nueva queda Activa.
  crear(sesion: Sesion, cuerpo: unknown): Promise<Categoria> {
    const datos = validarCategoria(cuerpo);
    return this.operar(sesion, async (db) => {
      await revisarNombre(db, datos.nombre, null);
      const creada = await db.query<Categoria>(
        `INSERT INTO convi.categorias_convivencia
           (establecimiento_id, nombre, descripcion)
         VALUES (convi.establecimiento_actual(), $1, $2)
         RETURNING ${COLUMNAS}`,
        [datos.nombre, datos.descripcion],
      );
      return creada.rows[0];
    });
  }

  // Decisión del PO: el nombre y la descripción cambian siempre. Las
  // situaciones guardan la categoría y no su texto, así que muestran el
  // nombre nuevo.
  editar(sesion: Sesion, id: string, cuerpo: unknown): Promise<Categoria> {
    const datos = validarCategoria(cuerpo);
    return this.operar(sesion, async (db) => {
      await bloquear(db, id);
      await revisarNombre(db, datos.nombre, id);
      const editada = await db.query<Categoria>(
        `UPDATE convi.categorias_convivencia
         SET nombre = $2, descripcion = $3
         WHERE id = $1
         RETURNING ${COLUMNAS}`,
        [id, datos.nombre, datos.descripcion],
      );
      return editada.rows[0];
    });
  }

  // CA2: inactiva, deja de ofrecerse en situaciones nuevas (la base lo exige)
  // y las anteriores la conservan. Se puede volver a activar.
  cambiarEstado(
    sesion: Sesion,
    id: string,
    cuerpo: unknown,
  ): Promise<Categoria> {
    const estado = validarEstado(cuerpo);
    return this.operar(sesion, async (db) => {
      await bloquear(db, id);
      const cambiada = await db.query<Categoria>(
        `UPDATE convi.categorias_convivencia SET estado = $2
         WHERE id = $1
         RETURNING ${COLUMNAS}`,
        [id, estado],
      );
      return cambiada.rows[0];
    });
  }

  // Todas las rutas traducen igual los errores del modelo.
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

async function bloquear(db: PoolClient, id: string) {
  const actual = await db.query(
    `SELECT id FROM convi.categorias_convivencia WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (actual.rows.length === 0)
    throw new NotFoundException('No encontramos esa categoría.');
}

// Decisión del PO: el nombre no se repite en la escuela, sin importar
// mayúsculas ni tildes. Lo revisa solo la API (no hay índice único), así que
// dos altas con el mismo nombre en el mismo instante podrían pasar.
async function revisarNombre(
  db: PoolClient,
  nombre: string,
  id: string | null,
) {
  const repetida = await db.query<{ nombre: string }>(
    `SELECT nombre FROM convi.categorias_convivencia
     WHERE ${comparable('nombre')} = ${comparable('$1')}
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     LIMIT 1`,
    [nombre, id],
  );
  if (repetida.rows.length > 0)
    throw errorDeCampos({
      nombre: `Ya existe la categoría "${repetida.rows[0].nombre}".`,
    });
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code } = (error ?? {}) as { code?: string };
  // Otra persona cambió la categoría mientras se guardaba.
  if (code === '40001')
    return new ConflictException(
      'La categoría cambió mientras guardabas. Recarga la página e inténtalo de nuevo.',
    );
  return error;
}