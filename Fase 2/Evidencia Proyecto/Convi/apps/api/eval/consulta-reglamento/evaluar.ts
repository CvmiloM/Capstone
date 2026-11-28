// Mide la consulta del reglamento con IA (PB-117 a PB-119) contra un set de preguntas con
// la página que debería citar cada una. Usa el mismo código de la API y un Ollama local,
// sin base de datos: el reglamento se prepara aquí igual que en CONVI.
//
// Uso, desde apps/api:
//   node --experimental-transform-types --no-warnings --import ./eval/consulta-reglamento/registrar.mjs eval/consulta-reglamento/evaluar.ts "C:\ruta\reglamento.pdf" [P01,P02]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extraerDirecto } from '../../src/modules/documentos/extractor.ts';
import {
  construirMensajes,
  construirMensajesReformulacion,
  construirMensajesSeleccion,
  esquemaSeleccion,
  interpretarSeleccion,
  ESQUEMA_REFORMULACION,
  esquemaRespuesta,
  FRAGMENTOS_BUSCADOS,
  fusionarBusquedas,
  interpretarReformulacion,
  interpretarRespuesta,
  MODELO_GENERACION,
  seleccionarFragmentos,
  sinDisposicion,
  type FragmentoEncontrado,
} from '../../src/modules/normativa/consulta.ts';
import { MODELO_EMBEDDING } from '../../src/modules/documentos/preparacion.ts';

const OLLAMA = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(
  /\/$/,
  '',
);
const [rutaPdf, filtro] = process.argv.slice(2);
if (!rutaPdf) throw new Error('Indica la ruta del PDF del reglamento');
const solo = filtro?.split(',');
const carpeta = new URL('./.cache/', import.meta.url);
mkdirSync(carpeta, { recursive: true });

type Pregunta = {
  id: string;
  pregunta: string;
  paginas: number[];
  debe?: string[];
  no_debe?: string[];
};
type Preparado = FragmentoEncontrado & { embedding: number[] };

async function ollama<T>(ruta: string, cuerpo: unknown): Promise<T> {
  const r = await fetch(`${OLLAMA}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`Ollama respondió ${r.status} en ${ruta}`);
  return (await r.json()) as T;
}

const vectorizar = async (textos: string[]) =>
  (
    await ollama<{ embeddings: number[][] }>('/api/embed', {
      model: MODELO_EMBEDDING,
      input: textos,
      truncate: false,
    })
  ).embeddings;

/** Mismas opciones que fija convi-ia en POST /api/chat. */
const generar = async (mensajes: unknown, esquema: unknown) =>
  (
    await ollama<{ message: { content: string } }>('/api/chat', {
      model: MODELO_GENERACION,
      messages: mensajes,
      format: esquema,
      stream: false,
      think: false,
      keep_alive: '30m',
      options: { temperature: 0, num_ctx: 8192 },
    })
  ).message.content;

// El reglamento se prepara una vez y queda en .cache, identificado por su contenido.
const pdf = new Uint8Array(readFileSync(rutaPdf));
const huella = createHash('sha256').update(pdf).digest('hex').slice(0, 16);
const cache = new URL(`fragmentos-${huella}.json`, carpeta);
let base: Preparado[];
if (existsSync(cache))
  base = JSON.parse(readFileSync(cache, 'utf8')) as Preparado[];
else {
  const fragmentos = await extraerDirecto(pdf, 'pdf');
  base = [];
  for (let i = 0; i < fragmentos.length; i += 16) {
    const lote = fragmentos.slice(i, i + 16);
    const vectores = await vectorizar(lote.map((f) => f.contenido));
    lote.forEach((f, j) =>
      base.push({
        fragmento_id: `f${String(f.indice).padStart(4, '0')}`,
        version_id: 'version',
        documento_id: 'reglamento',
        titulo: 'Reglamento Interno y de Convivencia Escolar',
        etiqueta_version: '2026',
        pagina_desde: f.pagina_desde,
        pagina_hasta: f.pagina_hasta,
        contenido: f.contenido,
        distancia: 0,
        embedding: vectores[j],
      }),
    );
  }
  writeFileSync(cache, JSON.stringify(base));
}
console.log(`Reglamento con ${base.length} fragmentos\n`);

const largo = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const largos = base.map((f) => largo(f.embedding));

/** Igual que convi.buscar_fragmentos_normativa: distancia coseno, de menor a mayor. */
function buscar(vector: number[]): FragmentoEncontrado[] {
  const lv = largo(vector);
  return base
    .map(({ embedding, ...f }, i) => ({
      ...f,
      distancia:
        1 -
        embedding.reduce((s, x, j) => s + x * vector[j], 0) / (largos[i] * lv),
    }))
    .sort(
      (a, b) =>
        a.distancia - b.distancia ||
        a.fragmento_id.localeCompare(b.fragmento_id),
    )
    .slice(0, FRAGMENTOS_BUSCADOS);
}

const preguntas = (
  JSON.parse(
    readFileSync(new URL('./preguntas.json', import.meta.url), 'utf8'),
  ) as Pregunta[]
).filter((p) => !solo || solo.includes(p.id));

const filas = [];
for (const p of preguntas) {
  const inicio = Date.now();
  // Mismo recorrido que NormativaService.consultar.
  const original = buscar((await vectorizar([p.pregunta]))[0]);
  let consultas: string[] = [];
  let fragmentos: FragmentoEncontrado[] = [];
  if (seleccionarFragmentos(original).length) {
    consultas = interpretarReformulacion(
      await generar(
        construirMensajesReformulacion(p.pregunta),
        ESQUEMA_REFORMULACION,
      ),
      p.pregunta,
    ).slice(1);
    const otras = consultas.length
      ? (await vectorizar(consultas)).map(buscar)
      : [];
    fragmentos = fusionarBusquedas([original, ...otras]);
  }
  const encontradas = fragmentos.map((f) => f.pagina_desde);
  // Mismo paso de selección que el servicio.
  if (fragmentos.length)
    fragmentos = interpretarSeleccion(
      await generar(
        construirMensajesSeleccion(fragmentos, p.pregunta),
        esquemaSeleccion(fragmentos.length),
      ),
      fragmentos,
    );
  const r = fragmentos.length
    ? interpretarRespuesta(
        await generar(
          construirMensajes(fragmentos, p.pregunta),
          esquemaRespuesta(fragmentos.length),
        ),
        fragmentos,
      )
    : sinDisposicion();
  const elegidas = fragmentos.map((f) => f.pagina_desde);
  const citadas = r.citas.map((c) => c.pagina_desde);
  const negativa = p.paginas.length === 0;
  const encontrada = negativa
    ? null
    : encontradas.some((x) => x !== null && p.paginas.includes(x));
  // Además de citar la página esperada, la respuesta debe decir lo esencial (alguna de
  // las frases de "debe") y no mezclar otro caso (ninguna de "no_debe").
  const texto = r.respuesta.toLocaleLowerCase('es');
  const contiene = (frases?: string[]) =>
    (frases ?? []).filter((f) => texto.includes(f.toLocaleLowerCase('es')));
  const veredicto = negativa
    ? r.sin_disposicion
      ? 'OK'
      : 'INVENTA'
    : r.sin_disposicion
      ? 'SIN_DISPOSICION'
      : !citadas.some((x) => x !== null && p.paginas.includes(x))
        ? 'CITA_OTRA'
        : p.debe?.length && !contiene(p.debe).length
          ? 'LE_FALTA_LO_CLAVE'
          : contiene(p.no_debe).length
            ? 'MEZCLA_OTRO_CASO'
            : 'OK';
  const ms = Date.now() - inicio;
  filas.push({
    ...p,
    consultas,
    encontradas,
    elegidas,
    encontrada,
    citadas,
    veredicto,
    ms,
    respuesta: r.respuesta,
  });
  console.log(
    `${p.id} ${veredicto.padEnd(17)} página esperada ${negativa ? '-' : encontrada ? 'encontrada' : 'NO encontrada'}, citadas [${citadas.join(', ')}], ${ms} ms`,
  );
}

const positivas = filas.filter((f) => f.encontrada !== null);
const resumen = {
  pagina_encontrada: `${positivas.filter((f) => f.encontrada).length} de ${positivas.length}`,
  correctas: `${filas.filter((f) => f.veredicto === 'OK').length} de ${filas.length}`,
  revisar: filas
    .filter((f) => f.veredicto !== 'OK')
    .map((f) => `${f.id} ${f.veredicto}`),
  ms_promedio: Math.round(
    filas.reduce((s, f) => s + f.ms, 0) / Math.max(1, filas.length),
  ),
};
console.log(`\n${JSON.stringify(resumen, null, 2)}`);
const archivo = new URL(
  `resultado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  carpeta,
);
writeFileSync(archivo, JSON.stringify({ resumen, filas }, null, 2));
console.log(`\nDetalle con cada respuesta en ${archivo.pathname}`);
