import type { PoolClient, QueryResult } from 'pg';

// Rendimiento de las pantallas de lectura: la API está en Brazil South y
// Supabase en us-east-1, y cada viaje a la base cuesta unos 130 ms. Una
// pantalla que hace diez lecturas seguidas espera diez viajes aunque cada
// consulta tarde milisegundos. Este cliente junta en un solo viaje las
// lecturas que el código pide a la vez, sin cambiar cómo se escriben.

type Pendiente = {
  texto: string;
  resolver: (resultado: QueryResult) => void;
  rechazar: (error: unknown) => void;
};

/** Un elemento de un arreglo de PostgreSQL, entre comillas dobles. */
function elementoDeArreglo(valor: string) {
  return `"${valor.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * El valor de un parámetro escrito como literal de SQL. Se usa el escape de
 * la propia librería pg (escapeLiteral) y solo se aceptan los tipos que usan
 * las lecturas: texto, números, booleanos, nulos y arreglos de texto. Un
 * literal sin tipo se resuelve en PostgreSQL igual que un parámetro $1.
 */
function literal(db: PoolClient, valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'string') return db.escapeLiteral(valor);
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number' && Number.isFinite(valor))
    return db.escapeLiteral(String(valor));
  if (Array.isArray(valor) && valor.every((v) => typeof v === 'string'))
    return db.escapeLiteral(`{${valor.map(elementoDeArreglo).join(',')}}`);
  throw new Error('Valor no admitido al agrupar consultas.');
}

/** La consulta con sus $1, $2… reemplazados por los valores escapados. */
function conValores(db: PoolClient, texto: string, valores: unknown[]) {
  const sql = texto.trim().replace(/;$/, '');
  if (sql.includes(';'))
    throw new Error('Cada consulta agrupada debe ser una sola instrucción.');
  return sql.replace(/\$(\d+)/g, (_marca, numero: string) => {
    const indice = Number(numero) - 1;
    if (indice < 0 || indice >= valores.length)
      throw new Error(`Falta el valor de $${numero}.`);
    return literal(db, valores[indice]);
  });
}

/**
 * Envuelve el cliente de la transacción para que las lecturas que se piden a
 * la vez viajen juntas: cada db.query() queda en cola, y en el siguiente turno
 * del event loop la cola completa se envía como un solo mensaje con varias
 * instrucciones (protocolo simple de PostgreSQL, que las ejecuta en orden,
 * dentro de la misma transacción y con el mismo contexto de sesión). Una
 * lectura que depende de otra entra en el viaje siguiente.
 *
 * Solo para lecturas dentro de CuentaService.operar. Si un viaje falla, fallan
 * todas sus consultas y el cliente queda cerrado para no enviar nada más.
 * Usar con todasLasLecturas(), que espera a que termine cada lectura.
 */
export function agruparConsultas(db: PoolClient): PoolClient {
  let cola: Pendiente[] = [];
  let enviando = false;
  let programado = false;
  let fallo: unknown = null;

  const programar = () => {
    if (programado || enviando || cola.length === 0) return;
    programado = true;
    setImmediate(() => void enviar());
  };

  const enviar = async () => {
    programado = false;
    const lote = cola;
    cola = [];
    if (lote.length === 0) return;
    enviando = true;
    try {
      // El punto y coma va en su propia línea: un comentario -- al final de
      // una consulta no lo puede tapar.
      const respuesta = (await db.query(
        lote.map((consulta) => consulta.texto).join('\n;\n'),
      )) as QueryResult | QueryResult[];
      const resultados = Array.isArray(respuesta) ? respuesta : [respuesta];
      if (resultados.length !== lote.length)
        throw new Error('La base no devolvió un resultado por consulta.');
      lote.forEach((consulta, i) => consulta.resolver(resultados[i]));
    } catch (error) {
      fallo = error;
      for (const consulta of [...lote, ...cola]) consulta.rechazar(error);
      cola = [];
    } finally {
      enviando = false;
      programar();
    }
  };

  const query = (texto: string, valores: unknown[] = []) =>
    new Promise<QueryResult>((resolver, rechazar) => {
      if (fallo) return rechazar(fallo);
      try {
        cola.push({
          texto: conValores(db, texto, valores),
          resolver,
          rechazar,
        });
      } catch (error) {
        return rechazar(error);
      }
      programar();
    });

  // Las lecturas solo usan query(); el resto del cliente no se expone.
  return { query } as unknown as PoolClient;
}

/**
 * Espera todas las lecturas, también las que siguen después de que una
 * falla, para que ninguna use el cliente cuando la transacción ya terminó.
 * Si alguna falló, lanza el primer error.
 */
export async function todasLasLecturas<T extends Record<string, unknown>>(
  lecturas: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const claves = Object.keys(lecturas);
  const resultados = await Promise.allSettled(Object.values(lecturas));
  const datos: Record<string, unknown> = {};
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.status === 'rejected') throw resultado.reason;
    datos[claves[i]] = resultado.value;
  }
  return datos as { [K in keyof T]: Awaited<T[K]> };
}
