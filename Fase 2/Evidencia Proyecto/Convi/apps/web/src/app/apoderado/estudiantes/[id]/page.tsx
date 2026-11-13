import type { Metadata } from "next";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Icono, type NombreIcono } from "@/app/components/icono";
import { obtenerResumen } from "../../datos";
import { SinAcceso, diaConSemana, fechaCorta, hora, plural, rutaPupilo } from "../../piezas";

export const metadata: Metadata = { title: "Portal del apoderado" };

// Inicio del portal del pupilo: saludo, accesos a cada sección con su dato
// principal y el recordatorio de que el portal es solo de consulta.
export default async function InicioPupilo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = await obtenerResumen(id);
  if (!datos) return <SinAcceso />;
  const { estudiante: e, conteos: c, zona_horaria: zona, proxima_reunion: reunion } = datos;
  const tarjetas: { parte: string; icono: NombreIcono; tono: string; titulo: string; texto: string }[] = [
    { parte: "estudiante", icono: "persona", tono: "bg-accent text-primary", titulo: "Mi estudiante", texto: [e.nombre, e.curso].filter(Boolean).join(" · ") },
    { parte: "historial", icono: "historial", tono: "bg-verde/10 text-verde", titulo: "Historial de convivencia", texto: c.historial ? plural(c.historial, "registro", "registros") : "Sin registros" },
    { parte: "casos", icono: "carpeta", tono: "bg-accent text-primary", titulo: "Casos", texto: c.casos_activos ? plural(c.casos_activos, "caso activo", "casos activos") : c.casos_cerrados ? `Sin casos activos, ${plural(c.casos_cerrados, "cerrado", "cerrados")}` : "Sin casos registrados" },
    { parte: "documentos", icono: "documentos", tono: "bg-amarillo/15 text-[color:var(--naranjo-sombra)]", titulo: "Documentos y actas", texto: c.documentos ? plural(c.documentos, "documento", "documentos") : "Sin documentos" },
    { parte: "reuniones", icono: "anios", tono: "bg-accent text-primary", titulo: "Próxima reunión", texto: reunion ? `${fechaCorta(reunion.fecha, zona)} · ${hora(reunion.fecha, zona)}${reunion.lugar ? ` · ${reunion.lugar}` : ""}` : "Sin reuniones programadas" },
    { parte: "acceso", icono: "candado", tono: "bg-muted text-pizarra", titulo: "Mi acceso", texto: datos.acceso?.expira_en ? `Vigente hasta el ${fechaCorta(datos.acceso.expira_en, zona)}` : "Vigente" },
  ];
  return <>
    <section aria-labelledby="saludo" className="rounded-2xl bg-tinta p-6 text-white shadow-tarjeta sm:p-8">
      <h1 id="saludo" className="text-2xl font-semibold sm:text-3xl">Hola, {datos.apoderado_nombres}</h1>
      <p className="mt-1.5 text-sm text-niebla">{diaConSemana(datos.hoy)} · {datos.escuela}</p>
      <p className="mt-5 rounded-xl bg-white/10 p-4 text-sm leading-relaxed text-white/90">Tu acceso está asociado a <strong className="font-semibold text-white">{e.nombre}</strong> y te permite consultar, en modo solo lectura, su historial de convivencia registrado en CONVI mientras tu autorización esté vigente</p>
    </section>
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {tarjetas.map((t) => <li key={t.parte}>
        <Link href={rutaPupilo(id, t.parte)} prefetch={false} className="presion group flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-tarjeta hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:p-5">
          <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${t.tono}`}><Icono nombre={t.icono} className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{t.titulo}</span><span className="mt-0.5 block truncate text-sm text-muted-foreground">{t.texto}</span></span>
          <Icono nombre="flecha" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </li>)}
    </ul>
    <p className="mt-4 flex gap-3 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground"><Icono nombre="escudo" className="mt-0.5 size-4 shrink-0" /><span>Este portal te permite consultar el historial de convivencia de {e.nombre} en modo solo lectura, el establecimiento es responsable de la gestión de cada proceso</span></p>
  </>;
}
