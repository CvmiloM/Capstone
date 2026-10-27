import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormularioEvidencia } from "@/app/components/evidencias/formulario-evidencia";
import { ListaEvidencias } from "@/app/components/evidencias/lista-evidencias";
import { claseEnlace } from "@/app/components/formulario";
import { AvisoSinPermiso } from "../../aviso-sin-permiso";
import {
  obtenerFormatoFecha,
  NOMBRE_ESTADO,
  obtenerSituacion,
  URGENCIA,
} from "../../datos";
import { NOMBRE_ROL_EN_SITUACION } from "../../situacion-opciones";
import { FormularioRespuesta } from "./formulario-respuesta";

export const metadata: Metadata = { title: "Detalle del registro" };

// HU-034 CA2 y CA3: detalle de una situación propia. Si es de otro profesor,
// la API responde 403 y se muestra el aviso sin revelar su contenido.
// PB-042: al llegar desde el formulario (?registrada=1) se confirma el registro.
// PB-049: cada aclaración pendiente se responde aquí (?respondida=1 al enviar).
// PB-066: también adjunta evidencias a la situación (?evidencia=1 al enviar).
export default async function PaginaDetalleSituacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
    searchParams: Promise<{ registrada?: string; respondida?: string; evidencia?: string }>;
}) {
  const [{ id }, { registrada, respondida, evidencia }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [respuesta, formatearFecha] = await Promise.all([obtenerSituacion(id), obtenerFormatoFecha()]);
  if (!respuesta.ok) return <AvisoSinPermiso volverA="/profesor/situaciones" />;
  const situacion = respuesta.datos;
  const urgencia = URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;

  return (
    <>
      <Link href="/profesor/situaciones" className={`text-sm ${claseEnlace}`}>
        ← Mis registros
      </Link>

      
      {registrada === "1" && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          Registraste la situación{" "}
          <strong className="font-mono">{situacion.codigo}</strong>. Convivencia
          ya la tiene como Nueva. Lo enviado no se puede editar: si necesitan
                   más información, te pedirán una aclaración.
          {situacion.curso_id && (
            <>
              {" "}
              <Link
                href={`/profesor/cursos/${situacion.curso_id}/registrar`}
                className={claseEnlace}
              >
                Registrar otra situación
              </Link>
            </>
          )}
        </div>
      )}

      {respondida === "1" && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          Enviaste tu respuesta. Convivencia la verá junto a su pregunta y
          continuará con la revisión.
        </div>
      )}

      {evidencia === "1" && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          Adjuntaste la evidencia. Convivencia la verá junto a la situación; no
          se puede editar ni borrar.
        </div>
      )}

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
                  {NOMBRE_ROL_EN_SITUACION[p.rol] ?? p.rol}
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
                                        <>
                      <p className="mt-3 inline-block rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                        Pendiente de tu respuesta
                      </p>
                      <FormularioRespuesta
                        aclaracionId={a.id}
                        situacionId={situacion.id}
                      />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Evidencias que aportaste">
          <ListaEvidencias
            evidencias={situacion.evidencias}
            rutaDescarga="/profesor/evidencias"
            vacio="No aportaste evidencias."
          />
        </Seccion>

        {/* PB-066 (HU-057): el profesor adjunta evidencias a sus propias situaciones. */}
        <Seccion titulo="Adjuntar evidencia" className="lg:col-span-3">
          <FormularioEvidencia destino="profesor-situacion" registroId={situacion.id} />
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