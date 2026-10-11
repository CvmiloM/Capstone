import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace } from "@/app/components/formulario";
import { AvisoSinPermiso } from "../../aviso-sin-permiso";
import {
  formatearFecha,
  NOMBRE_ESTADO,
  obtenerSituacion,
  URGENCIA,
} from "../../datos";

export const metadata: Metadata = { title: "Detalle del registro" };

// HU-034 CA2 y CA3: detalle de una situación propia. Si es de otro profesor,
// la API responde 403 y se muestra el aviso sin revelar su contenido.
export default async function PaginaDetalleSituacion({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const respuesta = await obtenerSituacion(id);
  if (!respuesta.ok) return <AvisoSinPermiso volverA="/profesor/situaciones" />;
  const situacion = respuesta.datos;
  const urgencia = URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;

  return (
    <>
      <Link href="/profesor/situaciones" className={`text-sm ${claseEnlace}`}>
        ← Mis registros
      </Link>

      <div className="mt-4 mb-6">
        <p className="font-mono text-sm text-muted-foreground">{situacion.codigo}</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {situacion.categoria ?? "Situación sin categoría"}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {NOMBRE_ESTADO[situacion.estado] ?? situacion.estado}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencia.clase}`}>
            Urgencia: {urgencia.texto}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Lo que registraste" className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm">{situacion.descripcion}</p>
        </Seccion>

        <Seccion titulo="Datos del registro">
          <dl className="space-y-3 text-sm">
            <Dato nombre="Ocurrió">{formatearFecha(situacion.ocurrido_en)}</Dato>
            <Dato nombre="Registrado">{formatearFecha(situacion.reportado_en)}</Dato>
            <Dato nombre="Curso">{situacion.curso ?? "Sin curso"}</Dato>
            <Dato nombre="Lugar">{situacion.lugar ?? "No indicado"}</Dato>
          </dl>
        </Seccion>

        <Seccion titulo="Estudiantes participantes" className="lg:col-span-3">
          <ul className="divide-y divide-border text-sm">
            {situacion.participantes.map((p) => (
              <li
                key={`${p.codigo_estudiante ?? ""}-${p.apellidos}-${p.nombres}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span className="font-medium">
                  {p.apellidos}, {p.nombres}
                  {p.codigo_estudiante && (
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                      {p.codigo_estudiante}
                    </span>
                  )}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {p.rol}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion titulo="Aclaraciones que te pidió Convivencia" className="lg:col-span-2">
          {situacion.aclaraciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No te han pedido aclaraciones.</p>
          ) : (
            <ul className="space-y-4">
              {situacion.aclaraciones.map((a) => (
                <li key={a.id} className="rounded-xl border border-border p-4 text-sm">
                  <p className="font-medium">{a.pregunta}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pedida el {formatearFecha(a.solicitado_en)}
                  </p>
                  {a.estado === "RESPONDIDA" && a.respuesta ? (
                    <div className="mt-3 border-l-2 border-verde pl-3">
                      <p className="whitespace-pre-line">{a.respuesta}</p>
                      {a.respondido_en && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Respondida el {formatearFecha(a.respondido_en)}
                        </p>
                      )}
                    </div>
                  ) : (
                    // Responderla es PB-049; aquí solo se muestra que está pendiente.
                    <p className="mt-3 inline-block rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                      Pendiente de tu respuesta
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Evidencias que aportaste">
          {situacion.evidencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">No aportaste evidencias.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {situacion.evidencias.map((ev) => (
                <li key={ev.id}>
                  <p className="font-medium">{ev.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {[ev.archivo, formatearFecha(ev.creado_en)].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </>
  );
}

function Seccion({
  titulo,
  className = "",
  children,
}: {
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-5 shadow-tarjeta ${className}`}
    >
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}