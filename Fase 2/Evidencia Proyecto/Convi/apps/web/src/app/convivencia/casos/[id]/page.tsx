import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormularioEvidencia } from "@/app/components/evidencias/formulario-evidencia";
import { ListaEvidencias } from "@/app/components/evidencias/lista-evidencias";
import { claseEnlace } from "@/app/components/formulario";
// Mismo formato de fecha y nombres de rol que el resto del portal.
import { obtenerFormatoFecha } from "@/app/profesor/datos";
import { NOMBRE_ROL_EN_SITUACION } from "@/app/profesor/situacion-opciones";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import {
  formatearDia,
  NOMBRE_ESTADO_CASO,
  obtenerCaso,
  type DetalleCaso,
} from "../datos";
import { FormularioRevisionNormativa } from "../../situaciones/[id]/formularios";
import { APLICABILIDAD, MODO_REVISION } from "../../situaciones/[id]/opciones";
import {
  FormularioAplicarProtocolo,
  FormularioCierre,
  FormularioEstado,
} from "./formularios";
import { SeguimientoCaso } from "./seguimientos";
import { Comunicaciones } from "./comunicaciones";
import { Encuentros } from "./encuentros";
import { OrientacionCaso } from "./orientacion";
import { PlanIntervencion } from "./plan-intervencion";
import { ProtocolosAplicados } from "./protocolo-aplicado";
import { ResumenCaso } from "./resumen";
import { FormularioContinuidad } from "./formulario-continuidad";
import {
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  ListaHistorial,
  type PaginaHistorial,
} from "@/app/components/auditoria/lista-historial";
import { pedir } from "../../datos";

export const metadata: Metadata = { title: "Caso" };

const AVISOS: Record<string, string> = {
  reabierto:
    "Reabriste el caso, el cierre anterior y sus respaldos se conservan en el historial",
  reasignado:
    "Cambiaste la persona responsable, la reasignación quedó registrada con tu nombre, fecha y motivo",
  seguimiento: "Guardaste los cambios del seguimiento",
  compromiso:
    "Registraste el compromiso, su cumplimiento se revisará en un seguimiento",
  creado:
    "Abriste el caso, quedó En análisis con su código, y la situación de origen y sus estudiantes quedaron vinculados.",
  vinculada:
    "Vinculaste la situación al caso, quedó en sus situaciones vinculadas con tu nombre, la fecha y el fundamento, y los estudiantes que faltaban se sumaron al caso.",
  estado:
    "Cambiaste el estado del caso, el cambio quedó en su historial con tu nombre, la fecha y el motivo.",
  cerrado:
    "Cerraste el caso, el cierre quedó en su historial con el resumen, y sus antecedentes se conservan.",
  evidencia:
    "Adjuntaste la evidencia al caso, quedó guardada en forma privada con tu nombre y la fecha, y no se puede editar ni borrar.",
  protocolo:
    "Aplicaste el protocolo, sus pasos quedaron en el caso con su vencimiento y su responsable.",
  normativa:
    "Registraste por qué el caso sigue sin protocolo, quedó con tu nombre y la fecha.",
  // PB-061 y PB-062 (HU-054): plan de intervención y sus acciones.
  plan: "Creaste el plan de intervención del caso, ahora puedes agregarle acciones.",
  "plan-estado":
    "Cambiaste el estado del plan, si lo terminaste, quedó la fecha de término y el motivo en la auditoría.",
  accion:
    "Agregaste la acción al plan, quedó Pendiente con su responsable y su vencimiento.",
  "accion-estado": "Registraste el avance de la acción.",
  "accion-corregida":
    "Corregiste la acción, la auditoría guarda el valor anterior, el nuevo y el motivo.",
  // PB-063 y PB-064 (HU-055): encuentros del caso.
  encuentro:
    "Programaste el encuentro, quedó Planificado con tu nombre como autor y sus asistentes Pendientes.",
  "encuentro-asistentes":
    "Agregaste asistentes al encuentro, quedaron Pendientes.",
  "encuentro-reprogramado":
    "Reprogramaste el encuentro, quedó Pospuesto con la nueva fecha, la anterior y el motivo quedan en la auditoría.",
  "encuentro-realizado":
    "Registraste el encuentro como realizado, con su resultado y la asistencia de cada participante.",
  "encuentro-cancelado":
    "Cancelaste el encuentro, el motivo queda en la auditoría.",
  // PB-055 y PB-056 (HU-048 y HU-049): pasos del protocolo y su término.
  "paso-avance":
    "Registraste el avance del paso, quedó con tu nombre y la fecha en la auditoría.",
  "paso-asignado":
    "Guardaste el responsable y el plazo del paso, la auditoría guarda el valor anterior y el nuevo.",
  "paso-evidencia":
    "Adjuntaste el respaldo al paso, también quedó en las evidencias del caso y no se puede editar ni borrar.",
  "protocolo-estado":
    "Cambiaste el estado del protocolo, el motivo y la fecha quedaron en la auditoría.",
  // PB-072 (HU-062): acta firmada de una entrevista o reunión.
  acta: "Adjuntaste el acta firmada al encuentro, quedó como evidencia de tipo Acta con tu nombre y la fecha, y no se puede editar ni borrar.",
  // PB-067 (HU-058): comunicaciones del caso.
  comunicacion:
    "Registraste la comunicación con tu nombre y la fecha de registro, no se puede editar ni trasladar a otro caso. Si el apoderado no podía ser contactado, la advertencia quedó en la auditoría.",
};

/** HU-047 CA2: las tareas sin terminar, en palabras. */
function textosPendientes(pendientes: DetalleCaso["pendientes"]) {
  const textos: string[] = [];
  const agregar = (cantidad: number, uno: string, varios: string) => {
    if (cantidad > 0)
      textos.push(`${cantidad} ${cantidad === 1 ? uno : varios}`);
  };
  agregar(
    pendientes.actuaciones,
    "actuación planificada o pospuesta",
    "actuaciones planificadas o pospuestas",
  );
  agregar(
    pendientes.compromisos,
    "compromiso sin cumplir ni cancelar",
    "compromisos sin cumplir ni cancelar",
  );
  agregar(
    pendientes.acciones_plan,
    "acción del plan de intervención sin terminar",
    "acciones del plan de intervención sin terminar",
  );
  agregar(
    pendientes.pasos_protocolo,
    "paso del protocolo sin completar ni omitir",
    "pasos del protocolo sin completar ni omitir",
  );
  return textos;
}

function nombreEstado(estado: string | null) {
  return estado ? (NOMBRE_ESTADO_CASO[estado] ?? estado) : "Sin estado";
}

// PB-053 (HU-046): detalle de un caso con sus estudiantes y las situaciones
// vinculadas. PB-152 (HU-131) y PB-054 (HU-047): historial de estados, cambio
// de estado y cierre. PB-058 y PB-059 permiten reabrirlo y reasignar su responsable.
export default async function PaginaCaso({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    aviso?: string;
    seccion?: string;
    antes?: string | string[];
    nuevo?: string;
    adjuntar?: string;
  }>;
}) {
  const [{ id }, { aviso, seccion: solicitada, antes, nuevo, adjuntar }] =
    await Promise.all([params, searchParams]);
  const secciones = [
    ["resumen", "Resumen"],
    ["participantes", "Participantes"],
    ["situaciones", "Situaciones"],
    ["protocolo", "Protocolo"],
    ["plan", "Plan de intervención"],
    ["encuentros", "Encuentros"],
    ["compromisos", "Compromisos"],
    ["seguimientos", "Seguimientos"],
    ["comunicaciones", "Comunicaciones"],
    ["evidencias", "Evidencias"],
    ["ia", "Orientación IA"],
    ["historial", "Historial"],
    ["estado", "Estado y cierre"],
  ];
  const seccion =
    secciones.find(([clave]) => clave === solicitada)?.[0] ?? "resumen";
  // Cada pestaña pide solo sus datos, y el historial va en paralelo con el caso.
  const [respuesta, formatearFecha, historial] = await Promise.all([
    obtenerCaso(id, seccion),
    obtenerFormatoFecha(),
    seccion === "historial"
      ? pedir<PaginaHistorial>(
          `/convivencia/casos/${encodeURIComponent(id)}/historial${antes ? `?antes=${encodeURIComponent(typeof antes === "string" ? antes : "invalida")}` : ""}`,
        )
      : null,
  ]);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/casos" />;
  const caso = respuesta.datos;
  const ruta = `/convivencia/casos/${caso.id}`;
  const nombres = [
    ...new Set(
      caso.participantes
        .filter((p) => p.estudiante_id)
        .map((p) => `${p.nombres} ${p.apellidos}`),
    ),
  ];
  const textoAviso = aviso ? AVISOS[aviso] : undefined;

  return (
    <>
      <Link href="/convivencia/casos" className={`text-sm ${claseEnlace}`}>
        ← Casos
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
        <p className="font-mono text-sm text-muted-foreground">{caso.codigo}</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {caso.titulo}
          {nombres.length > 0 && (
            <span className="font-normal"> — {nombres.join(", ")}</span>
          )}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Estado:{" "}
            {NOMBRE_ESTADO_CASO[caso.estado_actual] ?? caso.estado_actual}
          </span>
          {caso.registro_historico && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              Registro histórico
            </span>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Responsable:{" "}
          <span className="text-foreground">{caso.responsable}</span> · Inicio{" "}
          {formatearDia(caso.fecha_inicio)}
        </p>
        <div className="flex flex-wrap gap-2">
          {caso.estado_actual !== "CERRADO" && (
            <Link
              href={`${ruta}?seccion=seguimientos&nuevo=1#nuevo-seguimiento`}
              className={claseBotonSecundario}
            >
              Programar seguimiento
            </Link>
          )}
          {caso.estado_actual !== "CERRADO" && (
            <Link
              href={`${ruta}?seccion=evidencias&adjuntar=1#agregar-evidencia`}
              className={claseBotonPrimario}
            >
              Agregar evidencia
            </Link>
          )}
        </div>
      </div>
      <nav
        aria-label="Secciones del caso"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-3"
      >
        {secciones.map(([clave, texto]) => (
          <Link
            key={clave}
            href={`${ruta}?seccion=${clave}`}
            scroll={false}
            aria-current={seccion === clave ? "page" : undefined}
            className={`min-h-11 shrink-0 rounded-xl px-3 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${seccion === clave ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {texto}
          </Link>
        ))}
      </nav>
      {seccion === "resumen" && (
        <ResumenCaso caso={caso} fecha={formatearFecha} />
      )}
      {seccion === "historial" &&
        (historial?.ok ? (
          <Seccion titulo="Historial del caso">
            <p className="mb-4 text-sm text-muted-foreground">
              Hechos y cambios registrados, con su fecha y autor
            </p>
            <ListaHistorial
              pagina={historial.datos}
              ruta={`${ruta}?seccion=historial`}
              anteriores={Boolean(antes)}
              fecha={formatearFecha}
            />
          </Seccion>
        ) : (
          <AvisoNoDisponible volverA={ruta} />
        ))}
      <div className="grid gap-4 lg:grid-cols-3">
        {seccion === "ia" && (
          <Seccion titulo="Orientación con IA" className="lg:col-span-3">
            <OrientacionCaso casoId={caso.id} />
          </Seccion>
        )}

        {seccion === "participantes" && (
          <Seccion titulo="Participantes del caso" className="lg:col-span-3">
            <p className="mb-4 text-sm text-muted-foreground">
              El curso actual se actualiza con la matrícula, el curso registrado
              al incorporar al estudiante se conserva como antecedente del mismo
              caso
            </p>
            {caso.participantes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                El caso no tiene estudiantes.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {caso.participantes.map((p) => (
                  <li
                    key={`${p.codigo_estudiante ?? ""}-${p.apellidos}-${p.nombres}-${p.rol}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div>
                      <p className="font-medium">
                        {p.estudiante_id ? (
                          <Link
                            href={`/convivencia/estudiantes/${p.estudiante_id}`}
                            className={claseEnlace}
                          >
                            {p.nombres} {p.apellidos}
                          </Link>
                        ) : (
                          `${p.nombres} ${p.apellidos}`
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.estudiante_id
                          ? `Curso actual: ${p.curso_actual ?? "Sin matrícula activa"}`
                          : "Participante del caso"}
                        {p.rut ? ` · RUT: ${p.rut}` : ""}
                      </p>
                      {p.curso_matricula && (
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="cursor-pointer py-1">
                            Curso al registrar el caso
                          </summary>
                          <p className="mt-1">{p.curso_matricula}</p>
                        </details>
                      )}
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {NOMBRE_ROL_EN_SITUACION[p.rol] ?? p.rol}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}

        {seccion === "situaciones" && (
          <Seccion titulo="Situaciones vinculadas" className="lg:col-span-3">
            {caso.situaciones_vinculadas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                El caso no tiene situaciones vinculadas.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {caso.situaciones_vinculadas.map((s) => (
                  <li key={s.id} className="py-2.5">
                    <Link
                      href={`/convivencia/situaciones/${s.id}`}
                      className={claseEnlace}
                    >
                      <span className="font-mono">{s.codigo}</span>
                    </Link>{" "}
                    · {s.categoria ?? "Sin categoría"}
                    {/* PB-052 (HU-045 CA2): quién la vinculó, cuándo y por qué. */}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Ocurrió el {formatearFecha(s.ocurrido_en)} · vinculada el{" "}
                      {formatearFecha(s.vinculado_a_caso_en)} por{" "}
                      {s.vinculado_por}
                    </p>
                    {s.fundamento_vinculacion && (
                      <p className="mt-1 whitespace-pre-line text-muted-foreground">
                        {s.fundamento_vinculacion}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        )}

        {/* PB-066 (HU-057): evidencias del caso y de sus situaciones vinculadas. */}
        {seccion === "evidencias" && (
          <Seccion titulo="Evidencias del expediente" className="lg:col-span-3">
            <ListaEvidencias
              evidencias={caso.evidencias}
              rutaDescarga="/convivencia/evidencias"
              vacio="Todavía no hay evidencias en el caso ni en sus situaciones."
            />
            <div className="mt-4 border-t border-border pt-4">
              {caso.estado_actual === "CERRADO" ? (
                <p className="text-sm text-muted-foreground">
                  El caso está cerrado: conserva sus evidencias, pero no recibe
                  nuevas.
                </p>
              ) : (
                <details
                  open={adjuntar === "1"}
                  id="agregar-evidencia"
                  className="group rounded-xl bg-muted/50 p-4 open:bg-card [&:target]:outline-2 [&:target]:outline-ring"
                >
                  <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">
                    Agregar evidencia
                  </summary>
                  <div className="pt-4">
                    <FormularioEvidencia
                      destino="convivencia-caso"
                      registroId={caso.id}
                    />
                  </div>
                </details>
              )}
            </div>
          </Seccion>
        )}

        {/* PB-082 (HU-071): protocolo aplicado al caso, o por qué sigue sin uno. */}
        {seccion === "protocolo" && (
          <Seccion titulo="Protocolo" className="lg:col-span-3">
            {caso.protocolos_aplicados.length === 0 &&
              caso.revisiones_normativas.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Todavía no se aplica un protocolo ni se registra por qué el
                  caso sigue sin uno.
                </p>
              )}
            {/* PB-055 y PB-056: pasos, su avance y el término del protocolo. */}
            <ProtocolosAplicados
              caso={caso}
              formatearFecha={formatearFecha}
              adjuntar={adjuntar}
            />
            {caso.revisiones_normativas.map((r) => (
              <div
                key={r.id}
                className="mb-4 rounded-xl border border-border p-4 text-sm"
              >
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                    Sin protocolo ·{" "}
                    {APLICABILIDAD[r.aplicabilidad] ?? r.aplicabilidad}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {MODO_REVISION[r.modo_revision] ?? r.modo_revision}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line">{r.fundamento}</p>
                {r.protocolo && (
                  <p className="mt-2 text-muted-foreground">
                    Protocolo considerado:{" "}
                    <span className="text-foreground">{r.protocolo}</span>
                  </p>
                )}
                {r.referencias.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-muted-foreground">
                    {r.referencias.map((ref, n) => (
                      <li key={n}>
                        <Link
                          className={claseEnlace}
                          href={`/convivencia/documentos/versiones/${ref.version_documento_id}?pagina=${ref.pagina_desde ?? 1}`}
                        >
                          {ref.documento} ({ref.version})
                        </Link>
                        {ref.pagina_desde &&
                          (ref.pagina_hasta &&
                          ref.pagina_hasta !== ref.pagina_desde
                            ? `, páginas ${ref.pagina_desde} a ${ref.pagina_hasta}`
                            : `, página ${ref.pagina_desde}`)}
                        {ref.titulo_seccion && `, ${ref.titulo_seccion}`}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Registrada por {r.revisado_por} el{" "}
                  {formatearFecha(r.revisado_en)}
                </p>
              </div>
            ))}
            {caso.estado_actual !== "CERRADO" && (
              <div className="mt-4 grid gap-6 border-t border-border pt-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    Aplicar un protocolo
                  </h3>
                  {caso.protocolos_aplicables.length > 0 ? (
                    <FormularioAplicarProtocolo
                      casoId={caso.id}
                      protocolos={caso.protocolos_aplicables}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No hay protocolos publicados y vigentes, se preparan y
                      publican en{" "}
                      <Link
                        href="/convivencia/protocolos"
                        className={claseEnlace}
                      >
                        Protocolos
                      </Link>
                      .
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    O registrar que sigue sin protocolo
                  </h3>
                  <p className="mt-1 mb-3 text-sm text-muted-foreground">
                    Indica si la norma es aplicable y por qué no se aplica un
                    protocolo, no se crea una aplicación ficticia.
                  </p>
                  <FormularioRevisionNormativa
                    casoId={caso.id}
                    protocolos={caso.opciones_normativa.protocolos}
                    documentos={caso.opciones_normativa.documentos}
                  />
                </div>
              </div>
            )}
          </Seccion>
        )}

        {/* PB-061 y PB-062 (HU-054): plan de intervención con sus acciones. */}
        {seccion === "plan" && (
          <Seccion
            titulo="Plan de intervención"
            className="lg:col-span-3"
            id="plan-intervencion"
          >
            <PlanIntervencion caso={caso} formatearFecha={formatearFecha} />
          </Seccion>
        )}

        {/* PB-063 y PB-064 (HU-055): entrevistas, reuniones y otros encuentros. */}
        {seccion === "encuentros" && (
          <Seccion
            titulo="Encuentros"
            className="lg:col-span-3"
            id="encuentros"
          >
            <Encuentros
              caso={caso}
              formatearFecha={formatearFecha}
              adjuntar={adjuntar}
            />
          </Seccion>
        )}

        {["compromisos", "seguimientos"].includes(seccion ?? "") && (
          <Seccion
            titulo={seccion === "compromisos" ? "Compromisos" : "Seguimientos"}
            className="lg:col-span-3"
            id="seguimientos"
          >
            <SeguimientoCaso
              caso={caso}
              formatearFecha={formatearFecha}
              vista={seccion === "compromisos" ? "compromisos" : "seguimientos"}
              nuevo={nuevo === "1"}
            />
          </Seccion>
        )}

        {/* PB-067 (HU-058): llamadas, conversaciones y otros contactos del caso. */}
        {seccion === "comunicaciones" && (
          <Seccion
            titulo="Comunicaciones"
            className="lg:col-span-3"
            id="comunicaciones"
          >
            <Comunicaciones caso={caso} formatearFecha={formatearFecha} />
          </Seccion>
        )}

        {/* PB-152 (HU-131 CA1) y PB-054 (HU-047 CA4): cada cambio queda en el historial. */}
        {seccion === "estado" && (
          <Seccion titulo="Historial de estados" className="lg:col-span-2">
            {caso.movimientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                El caso sigue {nombreEstado(caso.estado_actual)}, el estado con
                que se abrió.
              </p>
            ) : (
              <ol className="space-y-4">
                {caso.movimientos.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-xl border border-border p-4 text-sm"
                  >
                    <p className="font-medium">
                      {nombreEstado(m.estado_anterior)} →{" "}
                      {nombreEstado(m.estado_nuevo)}
                    </p>
                    <p className="mt-1 whitespace-pre-line">{m.motivo}</p>
                    {m.resumen_cierre && (
                      <div className="mt-3 border-l-2 border-verde pl-3">
                        <p className="text-xs text-muted-foreground">
                          Resumen de cierre
                        </p>
                        <p className="mt-0.5 whitespace-pre-line">
                          {m.resumen_cierre}
                        </p>
                      </div>
                    )}
                    {m.justificacion_pendientes && (
                      <div className="mt-3 border-l-2 border-naranjo pl-3">
                        <p className="text-xs text-muted-foreground">
                          Cómo se atenderán las tareas que quedaron sin terminar
                        </p>
                        <p className="mt-0.5 whitespace-pre-line">
                          {m.justificacion_pendientes}
                        </p>
                      </div>
                    )}
                    {m.acta && (
                      <p className="mt-2 text-muted-foreground">
                        Acta de cierre:{" "}
                        <span className="text-foreground">{m.acta}</span>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Por {m.cambiado_por} el {formatearFecha(m.cambiado_en)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Seccion>
        )}

        {seccion === "estado" && (
          <div className="space-y-4">
            {caso.estado_actual === "CERRADO" ? (
              <Seccion titulo="Caso cerrado">
                <p className="text-sm text-muted-foreground">
                  El cierre y sus respaldos se conservan, puedes reabrir el caso
                  para continuar el acompañamiento
                </p>
                <div className="mt-4">
                  <FormularioContinuidad
                    casoId={caso.id}
                    modo="reapertura"
                    ultimoMovimientoId={caso.ultimo_movimiento_id}
                  />
                </div>
              </Seccion>
            ) : (
              <>
                {caso.estados_permitidos.length > 0 && (
                  <Seccion titulo="Cambiar estado">
                    <FormularioEstado
                      casoId={caso.id}
                      ultimoMovimientoId={caso.ultimo_movimiento_id}
                      opciones={caso.estados_permitidos.map((valor) => ({
                        valor,
                        texto: nombreEstado(valor),
                      }))}
                    />
                  </Seccion>
                )}
                {caso.puede_cerrar && (
                  <Seccion titulo="Cerrar caso">
                    <FormularioCierre
                      casoId={caso.id}
                      ultimoMovimientoId={caso.ultimo_movimiento_id}
                      pendientes={textosPendientes(caso.pendientes)}
                      actas={caso.actas_cierre.map((acta) => ({
                        id: acta.id,
                        texto: `${acta.titulo} (${formatearFecha(acta.fecha_documento)})`,
                      }))}
                    />
                  </Seccion>
                )}
              </>
            )}
            <Seccion titulo="Responsable del caso">
              <p className="text-sm">
                Responsable actual:{" "}
                <span className="font-medium">{caso.responsable}</span>
              </p>
              <details className="mt-3 rounded-xl border border-border p-4">
                <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
                  Reasignar responsable
                </summary>
                <p className="mt-2 mb-4 text-sm text-muted-foreground">
                  Puedes elegir a otra persona activa de Convivencia de esta
                  escuela, el cambio conserva los registros y queda en el
                  historial con su motivo
                </p>
                <FormularioContinuidad
                  casoId={caso.id}
                  modo="responsable"
                  version={caso.version_responsable}
                  opciones={caso.responsables_disponibles.filter(
                    (p) => p.id !== caso.responsable_id,
                  )}
                />
              </details>
            </Seccion>
          </div>
        )}
      </div>
    </>
  );
}

function Seccion({
  titulo,
  className = "",
  id,
  children,
}: {
  titulo: string;
  className?: string;
  /** Ancla para volver a la sección después de guardar. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-4 rounded-2xl border border-border bg-card p-5 shadow-tarjeta ${className}`}
    >
      <h2 className="mb-3 text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
