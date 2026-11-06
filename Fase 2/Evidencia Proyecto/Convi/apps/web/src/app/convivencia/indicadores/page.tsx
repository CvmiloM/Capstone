import { PestanasGrupo } from "../pestanas-grupo";

import type { Metadata } from "next";
import { Encabezado } from "@/app/components/formulario";
import { pedir } from "../datos";
import { explicarComparacion } from "../acciones-explicacion";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { ExplicacionIA } from "../explicacion-ia";
import { FiltrosIndicadores, type OpcionesIndicadores } from "./filtros";

export const metadata: Metadata = { title: "Indicadores de Convivencia" };

type Grupo = { nombre: string; total: number }[];
type Estado = { total: number; vencidos: number; pendientes: number; completados: number; cancelados: number };
type Indicadores = {
  desde: string;
  hasta: string;
  calculado_en: string;
  zona_horaria: string;
  total_situaciones: number;
  comparacion: {
    desde: string; hasta: string; dias: number;
    indicadores: { nombre: string; actual: number; anterior: number; variacion_porcentual: number | null }[];
  };
  gestion: { casos_cerrados: number; dias_promedio: number | null };
  movimientos: { cierres: number; casos_con_cierre: number; reaperturas: number; casos_reabiertos: number };
  por_dia: { fecha: string; total: number }[];
  por_mes: { mes: string; total: number }[];
  por_categoria: Grupo;
  por_lugar: Grupo;
  por_curso: Grupo;
  compromisos: Estado;
  seguimientos: Estado;
  cierres: { total: number; con_plazo: number; sin_plazo: number; oportunos: number; porcentaje_oportunos: number | null };
  definiciones: { indicador: string; fecha: string; formula: string; denominador: string }[];
  opciones: OpcionesIndicadores;
};

const caja = "rounded-2xl border border-border bg-card p-5 shadow-tarjeta";
const fechaCorta = (fecha: string) => fecha.split("-").reverse().join("-");

export default async function PaginaIndicadores({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const entrada = await searchParams;
  const inicial = {
    desde: typeof entrada.desde === "string" ? entrada.desde : "",
    hasta: typeof entrada.hasta === "string" ? entrada.hasta : "",
    curso: typeof entrada.curso === "string" ? entrada.curso : "",
    categoria: typeof entrada.categoria === "string" ? entrada.categoria : "",
  };
  const fechaValida = (valor: string) => /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
    Number.isFinite(Date.parse(`${valor}T00:00:00Z`)) &&
    new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;
  const valido = fechaValida(inicial.desde) && fechaValida(inicial.hasta) &&
    inicial.desde <= inicial.hasta &&
    (Date.parse(`${inicial.hasta}T00:00:00Z`) - Date.parse(`${inicial.desde}T00:00:00Z`)) / 86400000 <= 366;
  const solicitado = entrada.buscar === "1";
  const filtros = solicitado && valido ? new URLSearchParams(inicial) : new URLSearchParams();
  const respuesta = await pedir<Indicadores | Pick<Indicadores, "opciones">>(`/convivencia/indicadores?${filtros}`);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const datos = "total_situaciones" in respuesta.datos ? respuesta.datos : null;

  return <div className="space-y-6">
    <PestanasGrupo grupo="consultas" className="" />
    <Encabezado titulo="Indicadores de Convivencia"
      descripcion="Consulta situaciones, compromisos, seguimientos y cierres de tu escuela según el período que elijas" />
    <FiltrosIndicadores key={JSON.stringify(inicial)} inicial={inicial} opciones={respuesta.datos.opciones}
      error={solicitado && !valido ? "Elige dos fechas válidas, Hasta debe ser igual o posterior a Desde y el período no puede superar 367 días" : undefined} />
    {datos && <Resultados datos={datos} filtros={inicial} />}
  </div>;
}

function Resultados({ datos, filtros }: { datos: Indicadores; filtros: { desde: string; hasta: string; curso: string; categoria: string } }) {
  const corte = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long", timeStyle: "short", timeZone: datos.zona_horaria,
  }).format(new Date(datos.calculado_en));
  const porcentaje = datos.cierres.porcentaje_oportunos !== null
    ? `${datos.cierres.porcentaje_oportunos.toLocaleString("es-CL")} %`
    : "Sin datos";

  return <>
    <p className="text-sm text-muted-foreground">Del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)} · Cifras calculadas el {corte} · Zona horaria {datos.zona_horaria}</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Resumen titulo="Situaciones" valor={String(datos.total_situaciones)} ayuda="Hechos ocurridos en el período, cada situación cuenta una vez" />
      <Resumen titulo="Compromisos vencidos" valor={String(datos.compromisos.vencidos)} ayuda="No completados ni cancelados, con vencimiento en el período y plazo pasado" />
      <Resumen titulo="Seguimientos pendientes" valor={String(datos.seguimientos.pendientes)} ayuda="Programados en el período, aún sin realizar y con fecha futura" />
      <Resumen titulo="Cierres oportunos" valor={porcentaje} ayuda={`${datos.cierres.oportunos} de ${datos.cierres.con_plazo} casos cerrados con plazo, ${datos.cierres.sin_plazo} sin plazo excluidos`} />
    </div>
    <section className={caja} aria-labelledby="comparacion-periodos">
      <h2 id="comparacion-periodos" className="font-titulo text-xl font-semibold">Comparación entre períodos</h2>
      <p className="mt-2 text-sm text-muted-foreground">Período actual del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)}, período anterior del {fechaCorta(datos.comparacion.desde)} al {fechaCorta(datos.comparacion.hasta)}, ambos incluyen {datos.comparacion.dias} {datos.comparacion.dias === 1 ? "día" : "días"} y usan los mismos filtros.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Conteos y variación respecto del período inmediatamente anterior</caption>
          <thead className="border-b border-border text-muted-foreground"><tr>
            <th scope="col" className="py-2 pr-4 font-medium">Indicador</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Anterior</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Actual</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Variación</th>
          </tr></thead>
          <tbody>{datos.comparacion.indicadores.map((fila) => <tr key={fila.nombre} className="border-b border-border last:border-0">
            <th scope="row" className="py-3 pr-4 font-medium">{fila.nombre}</th>
            <td className="px-3 py-3 text-right tabular-nums">{fila.anterior}</td>
            <td className="px-3 py-3 text-right tabular-nums">{fila.actual}</td>
            <td className="py-3 pl-3 text-right tabular-nums">{fila.variacion_porcentual === null ? "No calculable" : `${fila.variacion_porcentual > 0 ? "+" : ""}${fila.variacion_porcentual.toLocaleString("es-CL")} %`}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Variación = (actual − anterior) × 100 / anterior, si el conteo anterior es cero, no se calcula, situaciones usa la fecha del hecho, cierres y reaperturas usan la fecha de cada cambio de estado</p>
      {/* PB-123 (HU-104): la IA explica esta tabla con los mismos valores, recalculados en el servidor. */}
      <div className="mt-5 border-t border-border pt-5">
        <ExplicacionIA
          key={JSON.stringify(filtros)}
          accion={explicarComparacion.bind(null, filtros)}
          boton="Explicar la comparación"
          ayuda="La IA explica con palabras simples la tabla de arriba, usando solo los períodos, conteos y denominadores que calculó CONVI con los mismos filtros"
          mensajes={{
            reposo: "Puedo explicarte con palabras simples qué cambió entre los dos períodos",
            buscando: "Recalculando los dos períodos con tus filtros…",
            pensando: "Comparando cada conteo con su denominador…",
            escribiendo: "Escribiendo la explicación…",
            listo: "Listo, compara el texto con los valores de al lado",
            error: "No pude explicarla ahora, la tabla de arriba sigue siendo válida",
          }}
        />
      </div>
    </section>
    <div className="grid gap-4 md:grid-cols-3">
      <Resumen titulo="Tiempo de gestión promedio"
        valor={datos.gestion.dias_promedio === null ? "Sin datos" : `${datos.gestion.dias_promedio.toLocaleString("es-CL")} días`}
        ayuda={`${datos.gestion.casos_cerrados} casos actualmente cerrados cuyo último cierre está en el período, promedio de días calendario entre apertura y último cierre, en la zona horaria de la escuela, incluye el tiempo antes de una reapertura`} />
      <Resumen titulo="Cierres registrados" valor={String(datos.movimientos.cierres)}
        ayuda={`${datos.movimientos.casos_con_cierre} casos distintos con cierres en el período, cada cierre del historial cuenta, aunque el caso se haya reabierto después`} />
      <Resumen titulo="Reaperturas registradas" valor={String(datos.movimientos.reaperturas)}
        ayuda={`${datos.movimientos.casos_reabiertos} casos distintos reabiertos en el período, cada reapertura del historial cuenta`} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Estados titulo="Compromisos" datos={datos.compromisos} fecha="fecha de vencimiento" />
      <Estados titulo="Seguimientos" datos={datos.seguimientos} fecha="fecha programada" />
    </div>
    <section className={caja} aria-label="Cierre oportuno">
      <h2 className="font-titulo text-xl font-semibold">Cierre oportuno de casos</h2>
      <p className="mt-2 text-sm text-muted-foreground">Se consideran los casos cerrados en el período, la fecha de cierre se compara con el plazo guardado en cada caso</p>
      <p className="mt-3 text-sm">{datos.cierres.total} cerrados · {datos.cierres.oportunos} a tiempo de {datos.cierres.con_plazo} con plazo · {datos.cierres.sin_plazo} sin plazo excluidos</p>
    </section>
    <div className="grid gap-4 xl:grid-cols-2">
      <Distribucion titulo="Por categoría" datos={datos.por_categoria} total={datos.total_situaciones} />
      <Distribucion titulo="Por curso" datos={datos.por_curso} total={datos.total_situaciones} />
      <Distribucion titulo="Por lugar" datos={datos.por_lugar} total={datos.total_situaciones} />
      <Distribucion titulo="Por mes" datos={datos.por_mes.map((x) => ({ nombre: new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${x.mes}-01T12:00:00Z`)), total: x.total }))} total={datos.total_situaciones} />
    </div>
    <details className={caja}>
      <summary className="cursor-pointer font-titulo text-xl font-semibold">Distribución por día</summary>
      <div className="mt-4"><Distribucion titulo="Días con situaciones" datos={datos.por_dia.map((x) => ({ nombre: fechaCorta(x.fecha), total: x.total }))} total={datos.total_situaciones} sinBorde /></div>
    </details>
    <details className={caja}><summary className="cursor-pointer text-sm font-semibold">Definiciones de cálculo del servidor</summary><dl className="mt-4 space-y-4 text-sm">{datos.definiciones.map(d=><div key={d.indicador}><dt className="font-semibold">{d.indicador}</dt><dd className="mt-1 space-y-1 text-muted-foreground"><p>{d.fecha}</p><p>{d.formula}</p><p>{d.denominador}</p></dd></div>)}</dl></details>
  </>;
}

function Resumen({ titulo, valor, ayuda }: { titulo: string; valor: string; ayuda: string }) {
  return <section className={caja}><h2 className="text-sm font-medium text-muted-foreground">{titulo}</h2><p className="mt-2 font-titulo text-3xl font-semibold">{valor}</p><p className="mt-2 text-xs text-muted-foreground">{ayuda}</p></section>;
}

function Estados({ titulo, datos, fecha }: { titulo: string; datos: Estado; fecha: string }) {
  return <section className={caja}><h2 className="font-titulo text-xl font-semibold">{titulo}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{datos.total} registros según {fecha} dentro del período</p>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {([['Vencidos', datos.vencidos], ['Pendientes', datos.pendientes], ['Completados', datos.completados], ['Cancelados', datos.cancelados]] as const).map(([etiqueta, valor]) =>
        <div key={etiqueta} className="rounded-xl bg-muted p-3"><dt className="text-muted-foreground">{etiqueta}</dt><dd className="mt-1 text-lg font-semibold">{valor}</dd></div>)}
    </dl>
  </section>;
}

function Distribucion({ titulo, datos, total, sinBorde = false }: { titulo: string; datos: Grupo; total: number; sinBorde?: boolean }) {
  return <section className={sinBorde ? "" : caja}><h2 className="font-titulo text-xl font-semibold">{titulo}</h2>
    {total === 0 ? <p className="mt-3 text-sm text-muted-foreground">Sin datos para este período</p> :
      <ul className="mt-4 space-y-3">{datos.map((fila) => <li key={fila.nombre}>
        <div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{fila.nombre}</span><span className="shrink-0 text-muted-foreground">{fila.total} de {total}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${fila.total * 100 / total}%` }} /></div>
      </li>)}</ul>}
  </section>;
}
