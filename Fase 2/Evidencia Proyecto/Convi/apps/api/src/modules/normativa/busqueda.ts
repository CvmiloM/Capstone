import type { PoolClient } from 'pg';
import {
  FRAGMENTOS_BUSCADOS,
  FRAGMENTOS_POR_CONSULTA,
  seleccionarFragmentos,
  type FragmentoEncontrado,
} from './consulta.js';

/**
 * Búsqueda en el reglamento publicado y vigente de la escuela de la sesión, con la
 * función del esquema buscar_fragmentos_normativa (solo Convivencia). Pide 12, en orden
 * de parecido y sin descartar nada.
 */
export async function buscarFragmentosCrudos(
  db: PoolClient,
  vector: number[],
): Promise<FragmentoEncontrado[]> {
  const encontrados = await db.query<FragmentoEncontrado>(
    `SELECT b.fragmento_id, b.version_id, b.documento_id, b.pagina_desde, b.pagina_hasta,
            b.contenido, b.distancia, d.titulo, v.etiqueta_version
     FROM convi.buscar_fragmentos_normativa($1, $2) b
     JOIN convi.versiones_documento v ON v.id = b.version_id
     JOIN convi.documentos_institucionales d ON d.id = b.documento_id
     ORDER BY b.distancia, b.fragmento_id`,
    [JSON.stringify(vector), FRAGMENTOS_BUSCADOS],
  );
  return encontrados.rows;
}

/**
 * Busca y se queda con los mejores sin las páginas del índice. La usa la orientación
 * del caso (PB-120 y PB-121), con una sola búsqueda.
 */
export async function buscarFragmentosNormativa(
  db: PoolClient,
  vector: number[],
  cantidad = FRAGMENTOS_POR_CONSULTA,
): Promise<FragmentoEncontrado[]> {
  return seleccionarFragmentos(await buscarFragmentosCrudos(db, vector)).slice(
    0,
    cantidad,
  );
}
