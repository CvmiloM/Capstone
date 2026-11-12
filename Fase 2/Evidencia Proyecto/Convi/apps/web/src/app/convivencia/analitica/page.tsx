import type { Metadata } from "next";
import { FormularioBusqueda } from "@/app/components/actividad";
import { claseBotonSecundario, Encabezado } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { NOMBRE_ESTADO_CASO } from "../casos/datos";
import { pedir } from "../datos";
import { PestanasGrupo } from "../pestanas-grupo";
import { GraficoLineas } from "./graficos";

// Analítica de Convivencia (pestaña de Indicadores e informes): la historia
// de la escuela en gráficos, hasta 10 años hacia atrás. Evolución mensual,
// comparación de un año con otro, categorías por año, duración de los casos y
// tiempo en cada estado. Todo viene agrupado de la API (convivencia/analitica),
// sin nombres ni registros, con las tablas existentes del modelo.

export const metadata: Metadata = { title: "Analítica de Convivencia" };

// Dos series que pasan las pruebas de daltonismo (validadas): azul y naranjo
// oscuro, la segunda además punteada. Una sola serie usa el azul de CONVI.
const SERIE_A = "#2563a8";
const SERIE_B = "#c2410c";

type Analitica = {
  calculado_en: string;
  zona_horaria: string;
  hoy: string;
  total_situaciones: number;
  por_mes: { mes: string; total: number }[];
  anios: { anio: number; meses: (number | null)[]; total: number }[];
  categorias: { nombre: string; total: number; por_anio: number[] }[];
  duracion: { nombre: string; cerrados: number; abiertos: number }[];
  resumen_casos: {
    cerrados: number;
    abiertos: number;
    mediana_cerrados: number | null;
    promedio_cerrados: number | null;
    abierto_mas_antiguo: number | null;
  };
  casos_por_anio: { anio: number; abiertos: number; cerrados: number }[];
  tiempo_por_estado: { estado: string; veces: number; casos: number; promedio_dias: number | null; mediana_dias: number | null }[];
  transiciones: { desde: string; hacia: string; total: number }[];
  opciones: { categorias: { id: string; nombre: string }[] };
};

const caja = "rounded-2xl border border-border bg-card p-5 shadow-tarjeta";
const control = "mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const numero = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 1 });
const estado = (codigo: string) => NOMBRE_ESTADO_CASO[codigo] ?? codigo;
const situaciones = (v: number) => `${numero(v)} ${v === 1 ? "situación" : "situaciones"}`;
const dias = (v: number | null) => (v === null ? "Sin datos" : `${numero(v)} ${v === 1 ? "día" : "días"}`);

export default async function PaginaAnalitica({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const entrada = await searchParams;
  const texto = (clave: string) => (typeof entrada[clave] === "string" ? (entrada[clave] as string) : "");
  const categoria = texto("categoria");
  const respuesta = await pedir<Analitica>(
    `/convivencia/analitica${categoria ? `?${new URLSearchParams({ categoria })}` : ""}`,
  );
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/indicadores" />;
  const d = respuesta.datos;

  const anios = d.anios.map((a) => a.anio);
  const ultimo = anios.at(-1) ?? Number(d.hoy.slice(0, 4));
  const elegido = anios.includes(Number(texto("anio"))) ? Number(texto("anio")) : ultimo;
  const otros = anios.filter((a) => a !== elegido);
  const comparado = otros.includes(Number(texto("comparar")))
    ? Number(texto("comparar"))
    : (otros.filter((a) => a < elegido).at(-1) ?? otros.at(-1) ?? null);
  const serieDe = (anio: number) => d.anios.find((a) => a.anio === anio);
  const nombreCategoria = d.opciones.categorias.find((c) => c.id === categoria)?.nombre;
  const corte = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long", timeStyle: "short", timeZone: d.zona_horaria,
  }).format(new Date(d.calculado_en));

  const etiquetasMes = d.por_mes.map((m) => `${MESES[Number(m.mes.slice(5)) - 1]} ${m.mes.slice(2, 4)}`);
  // «Sin especificar» solo aparece como la más recurrente si no hay otra.
  const masRecurrente = d.categorias.find((c) => c.nombre !== "Sin especificar") ?? d.categorias[0];
  const actual = serieDe(ultimo);
  const mismoPeriodoAnterior = (() => {
    const previo = serieDe(ultimo - 1);
    if (!previo || !actual) return null;
    const hasta = actual.meses.findLastIndex((v) => v !== null);
    return previo.meses.slice(0, hasta + 1).reduce<number>((s, v) => s + (v ?? 0), 0);
  })();

  return (
    <div className="space-y-6">
      <PestanasGrupo grupo="consultas" className="" />
      <Encabezado
        titulo="Analítica de Convivencia"
        descripcion="La historia de tu escuela en gráficos: cómo cambian las situaciones mes a mes, qué categorías se repiten y cuánto duran los casos"
      />

      <FormularioBusqueda action="/convivencia/analitica" scroll={false} aria-label="Filtrar la analítica"
        className={`${caja} flex flex-wrap items-end gap-3`}>
        <label className="block min-w-64 flex-1 text-sm font-medium sm:max-w-sm">Categoría
          <select name="categoria" defaultValue={categoria} className={control}>
            <option value="">Todas las categorías</option>
            {d.opciones.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <button type="submit" className={claseBotonSecundario}>Ver</button>
        <p className="basis-full text-xs text-muted-foreground">
          Hasta 10 años hacia atrás · Cifras calculadas el {corte} · Zona horaria {d.zona_horaria}
          {nombreCategoria && ` · Solo ${nombreCategoria}`}
        </p>
      </FormularioBusqueda>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Resumen titulo="Situaciones registradas" valor={numero(d.total_situaciones)}
          ayuda={`Desde ${etiquetasMes[0] ?? "este mes"}, cada situación cuenta una vez`} />
        <Resumen titulo={`Situaciones en ${ultimo}`} valor={numero(actual?.total ?? 0)}
          ayuda={mismoPeriodoAnterior === null ? "Sin datos del año anterior para comparar"
            : `${numero(mismoPeriodoAnterior)} en el mismo período de ${ultimo - 1}`} />
        <Resumen titulo="Categoría más recurrente" valor={masRecurrente?.nombre ?? "Sin datos"}
          ayuda={masRecurrente ? `${situaciones(masRecurrente.total)} en todo el período` : "Aún no hay situaciones"} pequeno />
        <Resumen titulo="Casos abiertos hoy" valor={numero(d.resumen_casos.abiertos)}
          ayuda={d.resumen_casos.abierto_mas_antiguo === null ? "Ningún caso abierto"
            : `El más antiguo lleva ${dias(d.resumen_casos.abierto_mas_antiguo)} abierto`} />
      </div>

      <section className={caja} aria-labelledby="evolucion">
        <h2 id="evolucion" className="font-titulo text-xl font-semibold">Situaciones por mes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cómo crecen o bajan las situaciones en el tiempo, según la fecha del hecho</p>
        {d.total_situaciones === 0 ? <SinDatos /> : <>
          <GraficoLineas titulo="Situaciones por mes" etiquetas={etiquetasMes}
            marcaCada={Math.max(1, Math.ceil(etiquetasMes.length / 12))}
            series={[{ nombre: "Situaciones", valores: d.por_mes.map((m) => m.total), color: "var(--primary)" }]} />
          <DatosExactos columnas={["Mes", "Situaciones"]}
            filas={d.por_mes.map((m, i) => [etiquetasMes[i], m.total])} />
        </>}
      </section>

      <section className={caja} aria-labelledby="comparacion">
        <h2 id="comparacion" className="font-titulo text-xl font-semibold">Comparación entre años</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cada mes de un año frente al mismo mes de otro, para ver si la escuela va mejor o peor que antes</p>
        {anios.length < 2 ? (
          <p className="mt-4 text-sm text-muted-foreground">Hace falta más de un año con registros para comparar</p>
        ) : <>
          <FormularioBusqueda action="/convivencia/analitica" scroll={false} aria-label="Elegir los años a comparar"
            className="mt-4 flex flex-wrap items-end gap-3">
            {categoria && <input type="hidden" name="categoria" value={categoria} />}
            <label className="block text-sm font-medium">Año
              <select name="anio" defaultValue={elegido} className={control}>
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Comparado con
              <select name="comparar" defaultValue={comparado ?? ""} className={control}>
                {otros.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <button type="submit" className={claseBotonSecundario}>Comparar</button>
          </FormularioBusqueda>
          {comparado !== null && (() => {
            const a = serieDe(elegido)!;
            const b = serieDe(comparado)!;
            return <>
              <GraficoLineas titulo={`Situaciones por mes, ${elegido} comparado con ${comparado}`} etiquetas={MESES}
                series={[
                  { nombre: String(elegido), valores: a.meses, color: SERIE_A },
                  { nombre: String(comparado), valores: b.meses, color: SERIE_B, punteada: true },
                ]} />
              <p className="mt-2 text-sm">{elegido}: {situaciones(a.total)} · {comparado}: {situaciones(b.total)}
                {a.meses.includes(null) && `, ${elegido} todavía no termina`}
                {b.meses.includes(null) && `, ${comparado} todavía no termina`}</p>
              <DatosExactos columnas={["Mes", String(elegido), String(comparado), "Diferencia"]}
                filas={MESES.map((m, i) => [m, a.meses[i] ?? "—", b.meses[i] ?? "—",
                  a.meses[i] === null || b.meses[i] === null ? "—"
                    : `${a.meses[i]! - b.meses[i]! > 0 ? "+" : ""}${a.meses[i]! - b.meses[i]!}`])} />
            </>;
          })()}
        </>}
      </section>

      <section className={caja} aria-labelledby="categorias">
        <h2 id="categorias" className="font-titulo text-xl font-semibold">Categorías más recurrentes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Situaciones por categoría en todo el período, y cómo se reparten año a año</p>
        {d.categorias.length === 0 ? <SinDatos /> : <>
          <Barras filas={d.categorias.slice(0, 10).map((c) => ({ nombre: c.nombre, valor: c.total }))} />
          {d.categorias.length > 10 && <p className="mt-2 text-xs text-muted-foreground">Se muestran las 10 con más situaciones, todas están en la tabla por año</p>}
          <MatrizAnios anios={anios} categorias={d.categorias} />
        </>}
      </section>

      <section className={caja} aria-labelledby="duracion">
        <h2 id="duracion" className="font-titulo text-xl font-semibold">Duración de los casos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Días calendario desde que se abrió cada caso hasta su último cierre, o hasta hoy si sigue abierto</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          {([
            ["Casos cerrados", numero(d.resumen_casos.cerrados)],
            ["Duración típica de un cerrado", dias(d.resumen_casos.mediana_cerrados)],
            ["Promedio de un cerrado", dias(d.resumen_casos.promedio_cerrados)],
            ["Casos abiertos", numero(d.resumen_casos.abiertos)],
          ] as const).map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl bg-muted p-3"><dt className="text-muted-foreground">{etiqueta}</dt><dd className="mt-1 text-lg font-semibold">{valor}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">La duración típica es la mediana: la mitad de los casos cerrados duró menos que eso, un caso muy largo no la mueve como al promedio</p>
        {d.resumen_casos.cerrados + d.resumen_casos.abiertos === 0 ? <SinDatos /> : <BarrasPareadas filas={d.duracion} />}
        <DatosExactos columnas={["Año de apertura", "Casos abiertos ese año", "De ellos ya cerrados", "Siguen abiertos"]}
          filas={d.casos_por_anio.map((c) => [c.anio, c.abiertos, c.cerrados, c.abiertos - c.cerrados])} titulo="Ver casos por año de apertura" />
      </section>

      <section className={caja} aria-labelledby="trazabilidad">
        <h2 id="trazabilidad" className="font-titulo text-xl font-semibold">Trazabilidad de los casos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cuánto tiempo pasan los casos en cada estado antes de cambiar, según el historial de estados</p>
        {d.tiempo_por_estado.length === 0 ? <SinDatos /> : <>
          <Barras filas={d.tiempo_por_estado.map((e) => ({
            nombre: estado(e.estado), valor: e.promedio_dias ?? 0,
            texto: `${dias(e.promedio_dias)} en promedio · típico ${dias(e.mediana_dias)}`,
          }))} />
          <p className="mt-2 text-xs text-muted-foreground">Si el caso sigue en ese estado, cuenta hasta hoy, Cerrado no se mide porque es el final</p>
          <DatosExactos columnas={["Estado", "Veces que se entró", "Casos", "Promedio", "Típico (mediana)"]}
            filas={d.tiempo_por_estado.map((e) => [estado(e.estado), e.veces, e.casos, dias(e.promedio_dias), dias(e.mediana_dias)])} />
          {d.transiciones.length > 0 && (
            <DatosExactos titulo="Ver los cambios de estado más frecuentes" columnas={["Desde", "Hacia", "Veces"]}
              filas={d.transiciones.slice(0, 15).map((t) => [estado(t.desde), estado(t.hacia), t.total])} />
          )}
        </>}
      </section>

      <p className="text-xs text-muted-foreground">Uso interno del equipo de Convivencia, las cifras describen los registros de CONVI, no determinan causas ni predicen la conducta de estudiantes</p>
    </div>
  );
}

function Resumen({ titulo, valor, ayuda, pequeno = false }: { titulo: string; valor: string; ayuda: string; pequeno?: boolean }) {
  return <section className={caja}>
    <h2 className="text-sm font-medium text-muted-foreground">{titulo}</h2>
    <p className={`mt-2 break-words font-titulo font-semibold ${pequeno ? "text-xl" : "text-3xl"}`}>{valor}</p>
    <p className="mt-2 text-xs text-muted-foreground">{ayuda}</p>
  </section>;
}

function SinDatos() {
  return <p className="mt-4 text-sm text-muted-foreground">Sin registros todavía</p>;
}

/** Barras horizontales de una serie, con su valor escrito al lado. */
function Barras({ filas }: { filas: { nombre: string; valor: number; texto?: string }[] }) {
  const maximo = Math.max(1, ...filas.map((f) => f.valor));
  return <ul className="mt-4 space-y-2.5">
    {filas.map((f) => (
      <li key={f.nombre} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(9rem,14rem)_1fr]">
        <span className="break-words text-sm">{f.nombre}</span>
        <div className="flex items-center gap-3">
          <div className="h-3 min-w-0 flex-1 rounded-r" aria-hidden="true">
            <div className="h-full rounded-r bg-primary" style={{ width: `${(f.valor / maximo) * 100}%`, minWidth: f.valor > 0 ? "3px" : 0 }} />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">{f.texto ?? numero(f.valor)}</span>
        </div>
      </li>
    ))}
  </ul>;
}

/** Cerrados y abiertos por tramo de duración, dos barras con leyenda. */
function BarrasPareadas({ filas }: { filas: { nombre: string; cerrados: number; abiertos: number }[] }) {
  const maximo = Math.max(1, ...filas.flatMap((f) => [f.cerrados, f.abiertos]));
  const barra = (valor: number, color: string, nombre: string) => (
    <div className="flex items-center gap-3">
      <div className="h-3 min-w-0 flex-1" aria-hidden="true">
        <div className="h-full rounded-r" style={{ width: `${(valor / maximo) * 100}%`, minWidth: valor > 0 ? "3px" : 0, background: color }} />
      </div>
      <span className="w-28 shrink-0 text-sm tabular-nums">{numero(valor)} <span className="text-muted-foreground">{nombre}</span></span>
    </div>
  );
  return <>
    <ul className="mt-5 flex flex-wrap gap-x-5 text-sm" aria-label="Leyenda">
      <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: SERIE_A }} />Cerrados, cuánto duraron</li>
      <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: SERIE_B }} />Abiertos, cuánto llevan</li>
    </ul>
    <ul className="mt-3 space-y-3">
      {filas.map((f) => (
        <li key={f.nombre} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(9rem,14rem)_1fr]">
          <span className="text-sm font-medium">{f.nombre}</span>
          <div className="space-y-[2px]">{barra(f.cerrados, SERIE_A, "cerrados")}{barra(f.abiertos, SERIE_B, "abiertos")}</div>
        </li>
      ))}
    </ul>
  </>;
}

/** Categorías por año: el color más intenso marca más situaciones. */
function MatrizAnios({ anios, categorias }: { anios: number[]; categorias: Analitica["categorias"] }) {
  const maximo = Math.max(1, ...categorias.flatMap((c) => c.por_anio));
  return <details className="mt-5" open={anios.length <= 6}>
    <summary className="cursor-pointer text-sm font-medium text-primary">Categorías año a año</summary>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Situaciones por categoría y año, el color más intenso marca más situaciones</caption>
        <thead className="text-muted-foreground"><tr>
          <th scope="col" className="py-2 pr-3 font-medium">Categoría</th>
          {anios.map((a) => <th key={a} scope="col" className="px-2 py-2 text-center font-medium">{a}</th>)}
          <th scope="col" className="py-2 pl-3 text-right font-medium">Total</th>
        </tr></thead>
        <tbody>{categorias.map((c) => (
          <tr key={c.nombre}>
            <th scope="row" className="min-w-40 py-1.5 pr-3 font-medium">{c.nombre}</th>
            {c.por_anio.map((v, i) => (
              <td key={anios[i]} className="min-w-14 border-2 border-card px-2 py-1.5 text-center tabular-nums"
                style={{ backgroundColor: v === 0 ? "transparent" : `color-mix(in srgb, var(--primary) ${Math.round(8 + (v / maximo) * 42)}%, var(--card))`, color: v / maximo > 0.6 ? "var(--primary-foreground)" : undefined }}>
                {v}
              </td>
            ))}
            <td className="py-1.5 pl-3 text-right font-semibold tabular-nums">{c.total}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </details>;
}

function DatosExactos({ columnas, filas, titulo = "Ver datos exactos" }: {
  columnas: string[];
  filas: (string | number)[][];
  titulo?: string;
}) {
  return <details className="mt-4">
    <summary className="cursor-pointer text-sm font-medium text-primary">{titulo}</summary>
    <div className="mt-3 max-h-96 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 border-b border-border bg-card text-muted-foreground"><tr>
          {columnas.map((c, i) => <th key={c} scope="col" className={`py-2 font-medium ${i === 0 ? "pr-3" : "px-3 text-right"}`}>{c}</th>)}
        </tr></thead>
        <tbody>{filas.map((f, n) => (
          <tr key={n} className="border-b border-border last:border-0">
            {f.map((v, i) => i === 0
              ? <th key={i} scope="row" className="py-2 pr-3 font-medium">{v}</th>
              : <td key={i} className="px-3 py-2 text-right tabular-nums">{typeof v === "number" ? numero(v) : v}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  </details>;
}
