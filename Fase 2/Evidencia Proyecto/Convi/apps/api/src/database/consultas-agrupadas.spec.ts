import pg, { type PoolClient } from 'pg';
import { agruparConsultas, todasLasLecturas } from './consultas-agrupadas.js';

// Cliente falso: guarda el texto que recibe y responde un resultado por
// instrucción, o falla si se le pide.
function clienteFalso(falla?: Error) {
  const enviados: string[] = [];
  const escape = new pg.Client();
  const cliente = {
    escapeLiteral: (valor: string) => escape.escapeLiteral(valor),
    query: async (texto: string) => {
      enviados.push(texto);
      if (falla) throw falla;
      const instrucciones = texto.split('\n;\n');
      const resultados = instrucciones.map((sql, i) => ({
        rows: [{ sql, i }],
      }));
      return resultados.length === 1 ? resultados[0] : resultados;
    },
  };
  return { cliente: cliente as unknown as PoolClient, enviados };
}

describe('consultas agrupadas', () => {
  it('envía en un solo viaje las lecturas pedidas a la vez, en orden', async () => {
    const { cliente, enviados } = clienteFalso();
    const db = agruparConsultas(cliente);
    const datos = await todasLasLecturas({
      uno: db.query('SELECT 1 WHERE x = $1', ['a']),
      dos: db.query('SELECT 2'),
      tres: db.query('SELECT 3 WHERE y = ANY($1::text[])', [['b', 'c']]),
    });
    expect(enviados).toHaveLength(1);
    expect(datos.uno.rows[0]).toEqual({ sql: "SELECT 1 WHERE x = 'a'", i: 0 });
    expect(datos.dos.rows[0]).toEqual({ sql: 'SELECT 2', i: 1 });
    expect(datos.tres.rows[0].sql).toBe(
      `SELECT 3 WHERE y = ANY('{"b","c"}'::text[])`,
    );
  });

  it('una lectura que depende de otra va en el viaje siguiente', async () => {
    const { cliente, enviados } = clienteFalso();
    const db = agruparConsultas(cliente);
    const primera = db.query('SELECT 1');
    await todasLasLecturas({
      primera,
      despues: primera.then(() => db.query('SELECT 2')),
      junto: db.query('SELECT 3'),
    });
    expect(enviados).toEqual(['SELECT 1\n;\nSELECT 3', 'SELECT 2']);
  });

  it('escapa comillas y barras, sin que un valor agregue instrucciones', async () => {
    const { cliente, enviados } = clienteFalso();
    const db = agruparConsultas(cliente);
    await db.query('SELECT $1, $2', ["x'; DROP TABLE t; --", 'a\\b']);
    // escapeLiteral de pg dobla la comilla y usa E'' cuando hay barras.
    expect(enviados[0]).toBe("SELECT 'x''; DROP TABLE t; --',  E'a\\\\b'");
    expect(enviados[0].split('\n;\n')).toHaveLength(1);
  });

  it('rechaza valores que no sabe escribir, consultas con ; y $n sin valor', async () => {
    const { cliente, enviados } = clienteFalso();
    const db = agruparConsultas(cliente);
    await expect(db.query('SELECT $1', [{ a: 1 }])).rejects.toThrow(
      'Valor no admitido',
    );
    await expect(db.query('SELECT 1; SELECT 2')).rejects.toThrow(
      'una sola instrucción',
    );
    await expect(db.query('SELECT $2', ['a'])).rejects.toThrow(
      'Falta el valor',
    );
    expect(enviados).toHaveLength(0);
  });

  it('si el viaje falla, fallan todas sus lecturas y no se envía nada más', async () => {
    const error = new Error('se cortó la conexión');
    const { cliente, enviados } = clienteFalso(error);
    const db = agruparConsultas(cliente);
    await expect(
      todasLasLecturas({
        uno: db.query('SELECT 1'),
        dos: db.query('SELECT 2'),
      }),
    ).rejects.toBe(error);
    await expect(db.query('SELECT 3')).rejects.toBe(error);
    expect(enviados).toHaveLength(1);
  });
});
