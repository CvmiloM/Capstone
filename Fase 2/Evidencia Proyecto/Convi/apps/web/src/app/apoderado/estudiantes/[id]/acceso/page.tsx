import type { Metadata } from "next";
import { Icono } from "@/app/components/icono";
import { obtenerResumen } from "../../../datos";
import { SinAcceso, TituloPantalla, fechaLarga, plural } from "../../../piezas";

export const metadata: Metadata = { title: "Mi acceso" };

const PUEDE = [
  "Consultar el historial de convivencia, los casos y sus antecedentes",
  "Descargar los documentos y actas de sus casos",
  "Revisar las reuniones programadas y las comunicaciones del establecimiento",
];
const NO_PUEDE = [
  "Crear, modificar o borrar registros, el portal es solo de lectura",
  "Ver casos en que no participa tu pupilo",
  "Seguir entrando después de la fecha de término del permiso",
];

export default async function MiAcceso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const datos = await obtenerResumen(id);
  if (!datos) return <SinAcceso />;
  const { acceso: a, zona_horaria: zona } = datos;
  // Días que le quedan al permiso: de hoy al día en que vence, los dos en la zona horaria de la escuela.
  const vence = a?.expira_en ? new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(a.expira_en)) : null;
  const dias = vence ? Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${datos.hoy}T00:00:00Z`)) / 86_400_000) : null;
  const campos: [string, string][] = [
    ["Pupilo", datos.estudiante.nombre],
    ["Relación con el estudiante", a?.tipo_relacion ?? "Sin registrar"],
    ["Apoderado principal", a?.es_principal ? "Sí" : "No"],
    ["Permiso otorgado el", a ? fechaLarga(a.otorgado_en, zona) : "Sin registrar"],
    ["Vigente hasta el", a?.expira_en ? fechaLarga(a.expira_en, zona) : "Sin fecha de término"],
    ["Establecimiento", datos.escuela],
  ];
  return <>
    <TituloPantalla titulo="Mi acceso" descripcion="El permiso con que consultas la información de tu pupilo en CONVI" />
    <section aria-labelledby="estado-acceso" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:p-7">
      <div className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-verde/10 text-verde"><Icono nombre="candado" className="size-6" /></span>
        <div className="min-w-0">
          <h2 id="estado-acceso" className="text-lg font-semibold">Acceso vigente</h2>
          <p className="text-sm text-muted-foreground">{a?.expira_en ? `Hasta el ${fechaLarga(a.expira_en, zona)}` : "Sin fecha de término"}</p>
        </div>
      </div>
      {dias !== null && dias <= 30 && <p role="status" className="mt-4 flex gap-3 rounded-xl bg-amarillo/15 px-4 py-3 text-sm text-foreground"><Icono nombre="alerta" className="mt-0.5 size-4 shrink-0 text-pizarra" /><span>Tu permiso vence {dias <= 0 ? "hoy" : `en ${plural(dias, "día", "días")}`}, si necesitas mantenerlo pide al establecimiento que lo renueve</span></p>}
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {campos.map(([titulo, valor]) => <div key={titulo} className="rounded-xl bg-muted px-4 py-3">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</dt>
          <dd className="mt-1 font-medium break-words">{valor}</dd>
        </div>)}
      </dl>
    </section>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <section aria-labelledby="puedes" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <h2 id="puedes" className="text-lg font-semibold">Con este acceso puedes</h2>
        <ul className="mt-3 space-y-2 text-sm">{PUEDE.map((t) => <li key={t} className="flex gap-2.5"><Icono nombre="escudo" className="mt-0.5 size-4 shrink-0 text-verde" />{t}</li>)}</ul>
      </section>
      <section aria-labelledby="no-puedes" className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
        <h2 id="no-puedes" className="text-lg font-semibold">Con este acceso no puedes</h2>
        <ul className="mt-3 space-y-2 text-sm">{NO_PUEDE.map((t) => <li key={t} className="flex gap-2.5"><Icono nombre="candado" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{t}</li>)}</ul>
      </section>
    </div>
    <p className="mt-4 flex gap-3 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground"><Icono nombre="info" className="mt-0.5 size-4 shrink-0" /><span>Si necesitas renovar tu acceso, corregir tus datos o tienes dudas sobre un caso, comunícate con {datos.escuela}</span></p>
  </>;
}
