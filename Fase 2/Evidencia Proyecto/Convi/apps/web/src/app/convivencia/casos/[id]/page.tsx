import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormularioEvidencia } from "@/app/components/evidencias/formulario-evidencia";
import { ListaEvidencias } from "@/app/components/evidencias/lista-evidencias";
import { claseEnlace } from "@/app/components/formulario";
// Mismo formato de fecha y nombres de rol que el resto del portal.
import { formatearFecha } from "@/app/profesor/datos";
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

export const metadata: Metadata = { title: "Caso" };

const AVISOS: Record<string, string> = {
  creado:
    "Abriste el caso. Quedó En análisis con su código, y la situación de origen y sus estudiantes quedaron vinculados.",
  vinculada:
    "Vinculaste la situación al caso. Quedó en sus situaciones vinculadas con tu nombre, la fecha y el fundamento, y los estudiantes que faltaban se sumaron al caso.",
  estado:
    "Cambiaste el estado del caso. El cambio quedó en su historial con tu nombre, la fecha y el motivo.",
  cerrado:
    "Cerraste el caso. El cierre quedó en su historial con el resumen, y sus antecedentes se conservan.",
  evidencia:
    "Adjuntaste la evidencia al caso. Quedó guardada en forma privada con tu nombre y la fecha, y no se puede editar ni borrar.",
  protocolo:
    "Aplicaste el protocolo. Sus pasos quedaron en el caso con su vencimiento y su responsable.",
  normativa:
    "Registraste por qué el caso sigue sin protocolo. Quedó con tu nombre y la fecha.",
};

/** PB-082: estados del protocolo aplicado y de cada paso en el caso. */
const NOMBRE_ESTADO_PROTOCOLO: Record<string, string> = {
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};
const NOMBRE_ESTADO_PASO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  COMPLETADO: "Completado",
  OMITIDO: "Omitido",
  VENCIDO: "Vencido",
};

/** HU-047 CA2: las tareas sin terminar, en palabras. */
function textosPendientes(pendientes: DetalleCaso["pendientes"]) {
  const textos: string[] = [];
  const agregar = (cantidad: number, uno: string, varios: string) => {
    if (cantidad > 0) textos.push(`${cantidad} ${cantidad === 1 ? uno : varios}`);
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
// de estado y cierre. La reapertura de un caso cerrado es otro ítem (HU-051).
export default async function PaginaCaso({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const respuesta = await obtenerCaso(id);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/casos" />;
  const caso = respuesta.datos;
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
        <h1 className="mt-1 text-2xl font-semibold">{caso.titulo}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Estado: {NOMBRE_ESTADO_CASO[caso.estado_actual] ?? caso.estado_actual}
          </span>
          {caso.registro_historico && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              Registro histórico
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Resumen" className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm">{caso.resumen}</p>
          {caso.justificacion_independiente && (
            <div className="mt-4 border-t border-border pt-4 text-sm">
              <p className="text-xs text-muted-foreground">
                Por qué se abrió aparte de otros casos activos de los mismos estudiantes
              </p>
              <p className="mt-1 whitespace-pre-line">{caso.justificacion_independiente}</p>
            </div>
          )}
        </Seccion>

        <Seccion titulo="Datos del caso">
          <dl className="space-y-3 text-sm">
            <Dato nombre="Inicio">{formatearDia(caso.fecha_inicio)}</Dato>
            <Dato nombre="Responsable">{caso.responsable}</Dato>
            <Dato nombre="Categoría principal">{caso.categoria ?? "Sin categoría"}</Dato>
            <Dato nombre="Cierre sugerido">
              {caso.fecha_limite_cierre
                ? `${formatearDia(caso.fecha_limite_cierre)} (${caso.plazo_cierre_dias_aplicado} días)`
                : "La escuela no tiene plazo sugerido"}
            </Dato>
            <Dato nombre="Abierto">
              {formatearFecha(caso.abierto_en)} por {caso.abierto_por}
            </Dato>
            {caso.cerrado_en && (
              <Dato nombre="Cerrado">{formatearFecha(caso.cerrado_en)}</Dato>
            )}
          </dl>
        </Seccion>

        <Seccion titulo="Estudiantes del caso" className="lg:col-span-3">
          {caso.participantes.length === 0 ? (
            <p className="text-sm text-muted-foreground">El caso no tiene estudiantes.</p>
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
                          {p.apellidos}, {p.nombres}
                        </Link>
                      ) : (
                        `${p.apellidos}, ${p.nombres}`
                      )}
                      {p.codigo_estudiante && (
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                          {p.codigo_estudiante}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.curso_matricula
                        ? `Curso al ocurrir el hecho: ${p.curso_matricula}`
                        : "Curso histórico no registrado"}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {NOMBRE_ROL_EN_SITUACION[p.rol] ?? p.rol}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Situaciones vinculadas" className="lg:col-span-3">
          {caso.situaciones_vinculadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              El caso no tiene situaciones vinculadas.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {caso.situaciones_vinculadas.map((s) => (
                <li key={s.id} className="py-2.5">
                  <Link href={`/convivencia/situaciones/${s.id}`} className={claseEnlace}>
                    <span className="font-mono">{s.codigo}</span>
                  </Link>{" "}
                  · {s.categoria ?? "Sin categoría"}
                  {/* PB-052 (HU-045 CA2): quién la vinculó, cuándo y por qué. */}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ocurrió el {formatearFecha(s.ocurrido_en)} · vinculada el{" "}
                    {formatearFecha(s.vinculado_a_caso_en)} por {s.vinculado_por}
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

        {/* PB-066 (HU-057): evidencias del caso y de sus situaciones vinculadas. */}
        <Seccion titulo="Evidencias del expediente" className="lg:col-span-3">
          <ListaEvidencias
            evidencias={caso.evidencias}
            rutaDescarga="/convivencia/evidencias"
            vacio="Todavía no hay evidencias en el caso ni en sus situaciones."
          />
          <div className="mt-4 border-t border-border pt-4">
            {caso.estado_actual === "CERRADO" ? (
              <p className="text-sm text-muted-foreground">
                El caso está cerrado: conserva sus evidencias, pero no recibe nuevas.
              </p>
            ) : (
              <FormularioEvidencia destino="convivencia-caso" registroId={caso.id} />
            )}
          </div>
        </Seccion>

        {/* PB-082 (HU-071): protocolo aplicado al caso, o por qué sigue sin uno. */}
        <Seccion titulo="Protocolo" className="lg:col-span-3">
          {caso.protocolos_aplicados.length === 0 &&
            caso.revisiones_normativas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Todavía no se aplica un protocolo ni se registra por qué el caso
                sigue sin uno.
              </p>
            )}
          {caso.protocolos_aplicados.map((aplicado) => (
            <div key={aplicado.id} className="mb-4 rounded-xl border border-border p-4 text-sm">
              <p className="font-medium">
                {aplicado.protocolo} · versión {aplicado.numero_version}
                <span className="ml-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  {NOMBRE_ESTADO_PROTOCOLO[aplicado.estado] ?? aplicado.estado}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line">{aplicado.fundamento}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aplicado por {aplicado.aplicado_por} el {formatearFecha(aplicado.aplicado_en)}
              </p>
              <ol className="mt-3 divide-y divide-border border-t border-border">
                {aplicado.pasos.map((paso) => (
                  <li
                    key={paso.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-2"
                  >
                    <div>
                      <p>
                        {paso.orden_paso}. {paso.nombre}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          paso.vence_en
                            ? `Vence el ${formatearFecha(paso.vence_en)}`
                            : "Sin plazo",
                          paso.responsable
                            ? `Responsable: ${paso.responsable}`
                            : "Sin responsable asignado",
                          paso.es_obligatorio ? null : "Opcional",
                          paso.requiere_evidencia ? "Exige evidencia" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {NOMBRE_ESTADO_PASO[paso.estado] ?? paso.estado}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {caso.revisiones_normativas.map((r) => (
            <div key={r.id} className="mb-4 rounded-xl border border-border p-4 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  Sin protocolo · {APLICABILIDAD[r.aplicabilidad] ?? r.aplicabilidad}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {MODO_REVISION[r.modo_revision] ?? r.modo_revision}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-line">{r.fundamento}</p>
              {r.protocolo && (
                <p className="mt-2 text-muted-foreground">
                  Protocolo considerado: <span className="text-foreground">{r.protocolo}</span>
                </p>
              )}
              {r.referencias.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-muted-foreground">
                  {r.referencias.map((ref, n) => (
                    <li key={n}>
                          <Link className={claseEnlace} href={`/convivencia/documentos/versiones/${ref.version_documento_id}?pagina=${ref.pagina_desde ?? 1}`}>
                            {ref.documento} ({ref.version})
                          </Link>
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
            </div>
          ))}
          {caso.estado_actual !== "CERRADO" && (
            <div className="mt-4 grid gap-6 border-t border-border pt-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">Aplicar un protocolo</h3>
                {caso.protocolos_aplicables.length > 0 ? (
                  <FormularioAplicarProtocolo
                    casoId={caso.id}
                    protocolos={caso.protocolos_aplicables}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No hay protocolos publicados y vigentes. Se preparan y publican
                    en{" "}
                    <Link href="/convivencia/protocolos" className={claseEnlace}>
                      Protocolos
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold">O registrar que sigue sin protocolo</h3>
                <p className="mt-1 mb-3 text-sm text-muted-foreground">
                  Indica si la norma es aplicable y por qué no se aplica un
                  protocolo. No se crea una aplicación ficticia.
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

        {/* PB-152 (HU-131 CA1) y PB-054 (HU-047 CA4): cada cambio queda en el historial. */}
        <Seccion titulo="Historial de estados" className="lg:col-span-2">
          {caso.movimientos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              El caso sigue {nombreEstado(caso.estado_actual)}, el estado con que se
              abrió.
            </p>
          ) : (
            <ol className="space-y-4">
              {caso.movimientos.map((m) => (
                <li key={m.id} className="rounded-xl border border-border p-4 text-sm">
                  <p className="font-medium">
                    {nombreEstado(m.estado_anterior)} → {nombreEstado(m.estado_nuevo)}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{m.motivo}</p>
                  {m.resumen_cierre && (
                    <div className="mt-3 border-l-2 border-verde pl-3">
                      <p className="text-xs text-muted-foreground">Resumen de cierre</p>
                      <p className="mt-0.5 whitespace-pre-line">{m.resumen_cierre}</p>
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
                      Acta de cierre: <span className="text-foreground">{m.acta}</span>
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

        <div className="space-y-4">
          {caso.estado_actual === "CERRADO" ? (
            <Seccion titulo="Caso cerrado">
              <p className="text-sm text-muted-foreground">
                Sus antecedentes se conservan y ya no cambia de estado. Un caso
                cerrado solo se puede reabrir.
              </p>
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
        </div>
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
