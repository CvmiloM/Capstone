import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado, claseEnlace } from "@/app/components/formulario";
import { obtenerContextoAdmin } from "../../../datos";
import { AccesoPortal } from "../../../apoderados/acceso-portal";
import { obtenerApoderados, obtenerFicha } from "../../datos";
import {
  AgregarApoderado,
  FormularioContacto,
  FormularioTermino,
} from "./formularios";

export const metadata: Metadata = { title: "Apoderados del estudiante" };
const fecha = (valor: string | null) =>
  valor
    ? new Intl.DateTimeFormat("es-CL", {
        timeZone: "UTC",
        dateStyle: "medium",
      }).format(new Date(`${valor}T00:00:00Z`))
    : "Sin límite";
const NOMBRE_VIGENCIA = {
  VIGENTE: "Vigente",
  FUTURO: "Comienza después",
  TERMINADO: "Terminado",
};
const AVISO_VINCULO: Record<string, string> = {
  creado: "Vínculo registrado, no se otorgó acceso al portal",
  terminado:
    "Fecha de término guardada, el vínculo y sus antecedentes se conservaron",
  corregido:
    "Datos del contacto corregidos, el cambio quedó registrado con tu nombre y la fecha",
};
const AVISO_ACCESO: Record<string, string> = {
  invitar: "Invitación enviada, cuando active su cuenta podrás otorgarle acceso a este estudiante",
  otorgar: "Acceso otorgado para este estudiante, el permiso quedó registrado en Auditoría",
  renovar: "Vencimiento ampliado, la renovación quedó registrada en Auditoría",
  revocar: "Acceso revocado para este estudiante, el vínculo familiar y sus antecedentes se conservaron",
};

export default async function PaginaApoderados({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ buscar?: string; vinculo?: string; apoderado?: string; acceso?: string }>;
}) {
  const { id } = await params;
  const consulta = await searchParams;
  const buscar =
    typeof consulta.buscar === "string"
      ? consulta.buscar.trim().slice(0, 100)
      : "";
  const [ficha, datos, { escuela }] = await Promise.all([
    obtenerFicha(id),
    obtenerApoderados(id, buscar),
    obtenerContextoAdmin(),
  ]);
  if (!ficha || !datos) notFound();
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: escuela.zonaHoraria,
  }).format(new Date());
  return (
    <>
      <Link
        href={`/admin/estudiantes/${ficha.id}`}
        className={`text-sm ${claseEnlace}`}
      >
        ← Ficha del estudiante
      </Link>
      <div className="mt-4">
        <Encabezado
          titulo={`Apoderados de ${ficha.nombres} ${ficha.apellidos}`}
          descripcion="Registra su relación y las condiciones de contacto, este vínculo no crea una cuenta ni habilita el portal"
        />
      </div>
      {consulta.vinculo && AVISO_VINCULO[consulta.vinculo] && (
        <p role="status" className="mb-6 rounded-xl bg-primary/10 p-3 text-sm">
          {AVISO_VINCULO[consulta.vinculo]}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section aria-labelledby="titulo-vinculos">
          <h2 id="titulo-vinculos" className="mb-3 text-lg font-semibold">
            Vínculos registrados{" "}
            <span className="text-muted-foreground">
              ({datos.vinculos.length})
            </span>
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Los apoderados de este estudiante, abre una tarjeta para ver sus
            detalles
          </p>
          {datos.vinculos.length === 0 && (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Este estudiante todavía no tiene apoderados registrados
            </p>
          )}
          <ul className="space-y-4">
            {datos.vinculos.map((v) => (
              <li key={v.id}>
                <details id={`vinculo-${v.id}`} open={consulta.apoderado === v.id} className="group scroll-mt-6 rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
                  <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {v.nombres} {v.apellidos}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {v.tipo_relacion || "Relación sin especificar"}
                        {v.es_principal ? " · Apoderado principal" : ""}
                      </span>
                      <span className="mt-1 block break-all text-sm text-muted-foreground">
                        {v.correo ?? "Correo sin registrar"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                        {NOMBRE_VIGENCIA[v.vigencia]}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${v.acceso_habilitado ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                        {v.acceso_habilitado ? "Con acceso al portal" : "Sin acceso al portal"}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground transition-transform group-open:rotate-180"
                    >
                      ⌄
                    </span>
                  </summary>
                  <div className="mt-4 border-t border-border pt-4">
                    <dl className="space-y-2 text-sm">
                      <div>
                        <dt className="inline text-muted-foreground">RUT: </dt>
                        <dd className="inline">{v.rut ?? "Sin registrar"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">
                          Correo:{" "}
                        </dt>
                        <dd className="inline break-all">
                          {v.correo ?? "Sin registrar"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">
                          Teléfono:{" "}
                        </dt>
                        <dd className="inline">
                          {v.telefono ?? "Sin registrar"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">
                          Dirección:{" "}
                        </dt>
                        <dd className="inline">
                          {v.direccion ?? "Sin registrar"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">
                          Desde:{" "}
                        </dt>
                        <dd className="inline">{fecha(v.activo_desde)}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">
                          Hasta:{" "}
                        </dt>
                        <dd className="inline">{fecha(v.activo_hasta)}</dd>
                      </div>
                    </dl>
                    <p
                      className={`mt-4 rounded-xl p-3 text-sm ${v.puede_ser_contactado ? "bg-muted text-muted-foreground" : "bg-destructive/10 font-medium text-destructive"}`}
                    >
                      {v.puede_ser_contactado
                        ? "Puede ser contactado"
                        : "No puede ser contactado"}
                    </p>
                    <FormularioContacto estudianteId={ficha.id} vinculo={v} />
                    <AccesoPortal estudianteId={ficha.id} vinculo={v} zonaHoraria={escuela.zonaHoraria} hoy={hoy} aviso={consulta.apoderado === v.id ? AVISO_ACCESO[consulta.acceso ?? ""] : undefined} />
                    {!v.activo_hasta && (
                      <FormularioTermino
                        estudianteId={ficha.id}
                        vinculoId={v.id}
                        desde={v.activo_desde}
                        hoy={hoy}
                      />
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="titulo-vincular"
          className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-vincular" className="mb-4 text-lg font-semibold">
            Agregar apoderado
          </h2>
          <AgregarApoderado
            estudianteId={ficha.id}
            personasIniciales={datos.personas}
            buscarInicial={buscar}
          />
        </section>
      </div>
    </>
  );
}
