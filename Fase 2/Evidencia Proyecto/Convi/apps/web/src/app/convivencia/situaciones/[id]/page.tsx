import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace } from "@/app/components/formulario";
// Mismos estilos de urgencia, formato de fecha y nombres de rol que el portal del profesor.
import { formatearFecha, URGENCIA } from "@/app/profesor/datos";
import { NOMBRE_ROL_EN_SITUACION } from "@/app/profesor/situacion-opciones";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import {
  ESTADOS_ABIERTOS,
  NOMBRE_ESTADO,
  obtenerSituacion,
  quienInformo,
} from "../../datos";
import {
  FormularioAclaracion,
  FormularioResponsable,
  FormularioRevision,
  FormularioRevisionNormativa,
  FormularioUrgencia,
} from "./formularios";
import { APLICABILIDAD, MODO_REVISION } from "./opciones";

export const metadata: Metadata = { title: "Revisión de la situación" };

const AVISOS: Record<string, string> = {
  registrada:
    "Registraste la situación. Quedó Nueva en la bandeja, con su código.",
  revision:
    "Iniciaste la revisión. La situación quedó En revisión y su urgencia no cambió.",
  urgencia:
    "Cambiaste la urgencia. El cambio y su motivo quedaron registrados en la auditoría.",
  aclaracion:
    "Enviaste la pregunta al profesor. La situación quedó en Información solicitada hasta que responda.",
  responsable:
    "Guardaste el responsable de la revisión. El cambio quedó registrado en la auditoría y el estado no cambió.",
  normativa:
    "Guardaste la revisión normativa. Quedó en el historial de la situación y su estado no cambió.",
};

// PB-044 (HU-037): detalle de una situación para revisarla. Abrirlo no cambia
// su estado: la revisión empieza con el botón Iniciar revisión (CA2).
// PB-045 (HU-038): durante la revisión se puede pedir una aclaración al
// profesor que la registró. PB-155 (HU-134): también se registra lo que
// indica la normativa antes de decidir. PB-046 (HU-039): mientras siga abierta se asigna
// a quien la revisa, sin cambiar su estado.
export default async function PaginaRevisionSituacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const respuesta = await obtenerSituacion(id);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const situacion = respuesta.datos;
  const urgencia = URGENCIA[situacion.urgencia] ?? URGENCIA.NORMAL;
  const textoAviso = aviso ? AVISOS[aviso] : undefined;
  // HU-038 CA2: solo se pregunta al profesor que registró la situación, y
  // mientras la revisión sigue abierta.
  const deProfesor = situacion.tipo_origen === "PROFESOR";
  const puedePedirAclaracion =
    deProfesor &&
    ["EN_REVISION", "INFORMACION_SOLICITADA"].includes(situacion.estado);

  return (
    <>
      <Link href="/convivencia" className={`text-sm ${claseEnlace}`}>
        ← Bandeja de situaciones
      </Link>

      {textoAviso && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          {textoAviso}
        </div>
      )}

      <div className="mt-4 mb-6">
        <p className="font-mono text-sm text-muted-foreground">{situacion.codigo}</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {situacion.categoria ?? "Situación sin categoría"}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Estado: {NOMBRE_ESTADO[situacion.estado] ?? situacion.estado}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencia.clase}`}>
            Urgencia: {urgencia.texto}
          </span>
        </div>
      </div>

      {situacion.estado === "NUEVA" && (
        <section className="mb-4 flex flex-col gap-4 rounded-2xl border border-primary/30 bg-accent p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Esta situación todavía no se revisa</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Al iniciar la revisión pasa a En revisión. Su urgencia se mantiene.
            </p>
          </div>
          <FormularioRevision situacionId={situacion.id} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Lo que se informó" className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm">{situacion.descripcion}</p>
        </Seccion>

        <Seccion titulo="Datos del registro">
          <dl className="space-y-3 text-sm">
            <Dato nombre="Ocurrió">{formatearFecha(situacion.ocurrido_en)}</Dato>
            <Dato nombre="Registrada">{formatearFecha(situacion.reportado_en)}</Dato>
            {/* HU-036 CA2: quién informó y quién registró, por separado. */}
            {quienInformo(situacion) && (
              <Dato nombre="Informó">{quienInformo(situacion)}</Dato>
            )}
            <Dato nombre="Registró">
              {situacion.reportado_por}
              {situacion.tipo_origen === "PROFESOR" ? " (profesor)" : " (Convivencia)"}
            </Dato>
            <Dato nombre="Curso">{situacion.curso ?? "Sin curso"}</Dato>
            <Dato nombre="Lugar">{situacion.lugar ?? "No indicado"}</Dato>
          </dl>
        </Seccion>

        <Seccion titulo="Estudiantes participantes" className="lg:col-span-3">
          <ul className="divide-y divide-border text-sm">
            {situacion.participantes.map((p) => (
              <li
                key={`${p.codigo_estudiante ?? ""}-${p.apellidos}-${p.nombres}-${p.rol}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <p className="font-medium">
                    {p.apellidos}, {p.nombres}
                    {p.codigo_estudiante && (
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                        {p.codigo_estudiante}
                      </span>
                    )}
                  </p>
                  {/* PB-076 (HU-066 CA2 y CA3): el curso del día del hecho y, aparte, el actual. */}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.curso_matricula
                      ? `Curso al ocurrir el hecho: ${p.curso_matricula}`
                      : "Curso histórico no registrado"}
                    {" · "}
                    {p.curso_actual
                      ? `Curso actual: ${p.curso_actual}`
                      : "Sin matrícula activa hoy"}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {NOMBRE_ROL_EN_SITUACION[p.rol] ?? p.rol}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion titulo="Aclaraciones pedidas" className="lg:col-span-2">
          {situacion.aclaraciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no se han pedido aclaraciones.
            </p>
          ) : (
            <ul className="space-y-4">
              {situacion.aclaraciones.map((a) => (
                <li key={a.id} className="rounded-xl border border-border p-4 text-sm">
                  <p className="font-medium">{a.pregunta}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pedida por {a.solicitado_por} el {formatearFecha(a.solicitado_en)}
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
                    <p className="mt-3 inline-block rounded-full bg-naranjo px-2.5 py-0.5 text-xs font-semibold text-tinta">
                      Esperando respuesta del profesor
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {puedePedirAclaracion && (
            <FormularioAclaracion
              situacionId={situacion.id}
              profesor={situacion.reportado_por}
            />
          )}
          {deProfesor && situacion.estado === "NUEVA" && (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Inicia la revisión para poder pedir una aclaración al profesor.
            </p>
          )}
        </Seccion>

        <div className="space-y-4">
          <Seccion titulo="Responsable de la revisión">
            <p className="mb-4 text-sm">
              {situacion.responsable ? (
                <span className="font-medium">{situacion.responsable}</span>
              ) : (
                <span className="text-muted-foreground">Sin responsable asignado</span>
              )}
            </p>
            {ESTADOS_ABIERTOS.includes(situacion.estado) ? (
              <FormularioResponsable
                situacionId={situacion.id}
                responsableActual={situacion.responsable_id}
                opciones={situacion.opciones_responsable}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                La revisión de esta situación terminó; su responsable ya no se cambia.
              </p>
            )}
          </Seccion>

          <Seccion titulo="Urgencia">
            {ESTADOS_ABIERTOS.includes(situacion.estado) ? (
              <FormularioUrgencia
                situacionId={situacion.id}
                urgenciaActual={situacion.urgencia}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                La revisión de esta situación terminó; su urgencia ya no se cambia.
              </p>
            )}
          </Seccion>
        </div>

        {/* PB-155 (HU-134): lo que indica la normativa, antes de decidir. */}
        <Seccion titulo="Revisión normativa" className="lg:col-span-3">
          {situacion.revisiones_normativas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no se registra lo que indica el reglamento o el protocolo.
            </p>
          ) : (
            <ul className="space-y-4">
              {situacion.revisiones_normativas.map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-4 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                      {APLICABILIDAD[r.aplicabilidad] ?? r.aplicabilidad}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {MODO_REVISION[r.modo_revision] ?? r.modo_revision}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line">{r.fundamento}</p>
                  {r.protocolo && (
                    <p className="mt-2 text-muted-foreground">
                      Protocolo: <span className="text-foreground">{r.protocolo}</span>
                    </p>
                  )}
                  {r.referencias.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-muted-foreground">
                      {r.referencias.map((ref, n) => (
                        <li key={n}>
                          {ref.documento} ({ref.version})
                          {ref.pagina_desde &&
                            (ref.pagina_hasta && ref.pagina_hasta !== ref.pagina_desde
                              ? `, páginas ${ref.pagina_desde} a ${ref.pagina_hasta}`
                              : `, página ${ref.pagina_desde}`)}
                          {ref.titulo_seccion && `, ${ref.titulo_seccion}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Registrada por {r.revisado_por} el {formatearFecha(r.revisado_en)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {["EN_REVISION", "INFORMACION_SOLICITADA"].includes(situacion.estado) && (
            <div className="mt-4 border-t border-border pt-4">
              <FormularioRevisionNormativa
                situacionId={situacion.id}
                protocolos={situacion.opciones_normativa.protocolos}
                documentos={situacion.opciones_normativa.documentos}
              />
            </div>
          )}
          {situacion.estado === "NUEVA" && (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Inicia la revisión para registrar lo que indica la normativa.
            </p>
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
