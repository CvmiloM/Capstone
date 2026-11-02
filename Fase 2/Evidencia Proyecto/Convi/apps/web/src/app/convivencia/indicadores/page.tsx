import type { Metadata } from "next";
import type { ReactNode } from "react";
import { claseBotonPrimario, Encabezado } from "@/app/components/formulario";
import { pedir } from "../datos";
import { AvisoNoDisponible } from "../aviso-no-disponible";

export const metadata: Metadata = { title: "Indicadores de Convivencia" };

type Grupo = { nombre: string; total: number }[];
type Estado = { total: number; vencidos: number; pendientes: number; completados: number; cancelados: number };
type Indicadores = {
  desde: string;
  hasta: string;
  calculado_en: string;
  zona_horaria: string;
  total_situaciones: number;
  por_dia: { fecha: string; total: number }[];
  por_mes: { mes: string; total: number }[];
  por_categoria: Grupo;
  por_lugar: Grupo;
  por_curso: Grupo;
  compromisos: Estado;
  seguimientos: Estado;
  cierres: { total: number; con_plazo: number; sin_plazo: number; oportunos: number };
  opciones: { cursos: { id: string; nombre: string }[]; categorias: { id: string; nombre: string }[] };
};

const caja = "rounded-2xl border border-border bg-card p-5 shadow-tarjeta";
const control = "w-full rounded-xl border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const fechaCorta = (fecha: string) => fecha.split("-").reverse().join("-");

export default async function PaginaIndicadores({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const entrada = await searchParams;
  const filtros = new URLSearchParams();
  for (const nombre of ["desde", "hasta", "curso", "categoria"])
    if (typeof entrada[nombre] === "string") filtros.set(nombre, entrada[nombre]);
  const respuesta = await pedir<Indicadores>(`/convivencia/indicadores?${filtros}`);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const datos = respuesta.datos;
  const corte = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long", timeStyle: "short", timeZone: datos.zona_horaria,
  }).format(new Date(datos.calculado_en));
  const porcentaje = datos.cierres.con_plazo
    ? `${Math.round(datos.cierres.oportunos * 100 / datos.cierres.con_plazo)} %`
    : "Sin datos";

  return <div className="space-y-6">
    <Encabezado titulo="Indicadores de Convivencia"
      descripcion="Consulta situaciones, compromisos, seguimientos y cierres de tu escuela según el período que elijas" />
    <form className={caja}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Campo titulo="Desde" nombre="desde"><input id="desde" name="desde" type="date" defaultValue={datos.desde} className={control} /></Campo>
        <Campo titulo="Hasta" nombre="hasta"><input id="hasta" name="hasta" type="date" defaultValue={datos.hasta} className={control} /></Campo>
        <Campo titulo="Curso" nombre="curso"><select id="curso" name="curso" defaultValue={typeof entrada.curso === "string" ? entrada.curso : ""} className={control}>
          <option value="">Todos los cursos</option>
          {datos.opciones.cursos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select></Campo>
        <Campo titulo="Categoría" nombre="categoria"><select id="categoria" name="categoria" defaultValue={typeof entrada.categoria === "string" ? entrada.categoria : ""} className={control}>
          <option value="">Todas las categorías</option>
          {datos.opciones.categorias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select></Campo>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={claseBotonPrimario}>Aplicar filtros</button>
        <a href="/convivencia/indicadores" className="text-sm text-primary underline-offset-4 hover:underline">Limpiar filtros</a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Período máximo de 367 días, las fechas corresponden a la zona horaria de la escuela</p>
    </form>
    <p className="text-sm text-muted-foreground">Del {fechaCorta(datos.desde)} al {fechaCorta(datos.hasta)} · Cifras calculadas el {corte}</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Resumen titulo="Situaciones" valor={String(datos.total_situaciones)} ayuda="Hechos ocurridos en el período, cada situación cuenta una vez" />
      <Resumen titulo="Compromisos vencidos" valor={String(datos.compromisos.vencidos)} ayuda="No completados ni cancelados, con vencimiento en el período y plazo pasado" />
      <Resumen titulo="Seguimientos pendientes" valor={String(datos.seguimientos.pendientes)} ayuda="Programados en el período, aún sin realizar y con fecha futura" />
      <Resumen titulo="Cierres oportunos" valor={porcentaje} ayuda={`${datos.cierres.oportunos} de ${datos.cierres.con_plazo} casos cerrados con plazo, ${datos.cierres.sin_plazo} sin plazo excluidos`} />
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
    <p className="text-xs text-muted-foreground">Las situaciones se agrupan por fecha del hecho, los compromisos por vencimiento, los seguimientos por fecha programada y los cierres por fecha de cierre, los estados se consultan al momento indicado arriba, las cifras por curso y categoría de compromisos, seguimientos y cierres corresponden a casos con al menos una situación vinculada que coincida con cada filtro</p>
  </div>;
}

function Campo({ titulo, nombre, children }: { titulo: string; nombre: string; children: ReactNode }) {
  return <div><label htmlFor={nombre} className="mb-1.5 block text-sm font-medium">{titulo}</label>{children}</div>;
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
