import { EtiquetaAccion } from "./etiqueta-accion";
import { Icono } from "@/app/components/icono";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import type { ReactNode } from "react";
import { FormularioEvidencia } from "@/app/components/evidencias/formulario-evidencia";
import { claseBotonPrimario, claseBotonSecundario, claseEnlace } from "@/app/components/formulario";
import { formatearDia, type DetalleCaso, type Encuentro } from "../datos";
import {
  FormularioAgregarAsistentes,
  FormularioCancelacionEncuentro,
  FormularioNuevoEncuentro,
  FormularioRealizacion,
  FormularioReprogramacion,
} from "./formularios-encuentros";
import {
  NOMBRE_ASISTENCIA,
  NOMBRE_ESTADO_ENCUENTRO,
  NOMBRE_ROL_ASISTENTE,
  NOMBRE_TIPO_ENCUENTRO,
} from "./opciones";
import { Desplegable } from "./plan-intervencion";

// PB-063 y PB-064 (HU-055): encuentros del caso, distinguiendo lo programado
// de lo realizado. Los seguimientos son otro ítem (PB-068).
const ABIERTO = ["PLANIFICADA", "POSPUESTA"];
// PB-072 (HU-062): decisión del PO (por defecto), el acta firmada se adjunta
// a una entrevista o reunión ya realizada.
const CON_ACTA = ["ENTREVISTA", "REUNION"];

export function Encuentros({
  caso,
  formatearFecha,
  adjuntar,
  accion,
  seleccionado,
}: {
  caso: DetalleCaso;
  formatearFecha: (iso: string) => string;
  /** Encuentro cuyo formulario de acta se muestra (?adjuntar=). */
  adjuntar?: string;
  accion?: string;
  seleccionado?: string;
}) {
  const abierto = caso.estado_actual !== "CERRADO";
  const ruta = `/convivencia/casos/${caso.id}`;
  const conActa = (encuentro: Encuentro) =>
    abierto && CON_ACTA.includes(encuentro.tipo) && encuentro.estado === "REALIZADA";
  const rango = (inicio: string | null, fin: string | null) =>
    inicio ? `${formatearFecha(inicio)}${fin ? ` hasta ${formatearFecha(fin)}` : ""}` : "Sin fecha";

  const elegirActa = accion === "acta";
  const elegir = abierto && (elegirActa || accion === "marcar") && !seleccionado;
  const opciones = elegirActa ? caso.encuentros.filter(conActa) : caso.encuentros.filter((e) => ABIERTO.includes(e.estado));
  const modo = accion === "realizada" ? "realizada" : accion === "programar" ? "programar" : undefined;
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Los encuentros sirven para programar entrevistas o reuniones y registrar quién asistió y qué se conversó
      </p>
      {abierto && (
        <div className="mb-5 space-y-3" id="nuevo-encuentro">
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className={claseBotonPrimario} href={`${ruta}?seccion=encuentros&accion=programar#nuevo-encuentro`}><EtiquetaAccion icono="anios">Programar un encuentro</EtiquetaAccion></Link>
            <Link className={claseBotonSecundario} href={`${ruta}?seccion=encuentros&accion=realizada#nuevo-encuentro`}><EtiquetaAccion icono="documentos">Guardar un encuentro realizado</EtiquetaAccion></Link>
          </div>
          {modo && (
            <div className="rounded-xl border border-border p-4">
              <Link href={`${ruta}?seccion=encuentros#nuevo-encuentro`} className={`mb-3 block w-fit text-sm ${claseEnlace}`}>Cerrar formulario</Link>
              <FormularioNuevoEncuentro key={modo} casoId={caso.id} responsables={caso.opciones_encuentro.responsables}
                asistentes={caso.opciones_encuentro.asistentes} acciones={caso.opciones_encuentro.acciones_plan}
                entrevista realizada={modo === "realizada"} />
            </div>
          )}
        </div>
      )}
      {elegir && (
        <section id="elegir-encuentro" className="mb-4 rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <h3 className="font-semibold">{elegirActa ? "Elige dónde adjuntar el acta" : "Elige el encuentro realizado"}</h3>
          {opciones.length === 0 ? (
            <p className="mt-2 text-muted-foreground">{elegirActa ? "Todavía no hay entrevistas o reuniones realizadas." : "No hay encuentros programados por marcar."}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {opciones.map((e) => (
                <li key={e.id}>
                  <Link className={claseEnlace} href={`${ruta}?seccion=encuentros&${elegirActa ? "adjuntar" : "encuentro"}=${e.id}#encuentro-${e.id}`}>
                    {e.objetivo} · {rango(e.realizado_en ?? e.programado_en, null)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {caso.encuentros.length === 0 && (
        <p className="text-sm text-muted-foreground">
          El caso todavía no tiene entrevistas, reuniones ni otros encuentros.
        </p>
      )}

      {caso.encuentros.map((encuentro) => (
        <details
          open={adjuntar === encuentro.id || seleccionado === encuentro.id}
          key={encuentro.id}
          id={`encuentro-${encuentro.id}`}
          className="mb-4 rounded-xl border border-border p-4 text-sm"
        >
          <summary className="cursor-pointer">
            <span className="ml-2 font-medium">{encuentro.objetivo}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {NOMBRE_TIPO_ENCUENTRO[encuentro.tipo] ?? encuentro.tipo} · {NOMBRE_ESTADO_ENCUENTRO[encuentro.estado] ?? encuentro.estado} · {rango(encuentro.realizado_en ?? encuentro.programado_en, null)}
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
              {NOMBRE_TIPO_ENCUENTRO[encuentro.tipo] ?? encuentro.tipo}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {NOMBRE_ESTADO_ENCUENTRO[encuentro.estado] ?? encuentro.estado}
            </span>
          </div>
          {encuentro.descripcion && (
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{encuentro.descripcion}</p>
          )}
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Dato nombre="Programado">{rango(encuentro.programado_en, encuentro.fin_programado_en)}</Dato>
            <Dato nombre="Lugar">{encuentro.lugar ?? "Sin lugar"}</Dato>
            <Dato nombre="Responsable">{encuentro.responsable}</Dato>
            <Dato nombre="Registrado por">
              {encuentro.creado_por} el {formatearFecha(encuentro.creado_en)}
            </Dato>
            {encuentro.accion && <Dato nombre="Acción del plan">{encuentro.accion}</Dato>}
          </dl>

          {encuentro.reprogramaciones > 0 && (
            <div className="mt-3 border-l-2 border-amarillo pl-3">
              <p className="text-xs text-muted-foreground">
                {encuentro.reprogramaciones === 1
                  ? "Reprogramado 1 vez"
                  : `Reprogramado ${encuentro.reprogramaciones} veces`}
                {encuentro.fecha_anterior &&
                  `. Fecha anterior: ${formatearFecha(encuentro.fecha_anterior)}`}
              </p>
              {encuentro.motivo_reprogramacion && (
                <p className="mt-0.5 whitespace-pre-line">{encuentro.motivo_reprogramacion}</p>
              )}
            </div>
          )}

          {encuentro.estado === "REALIZADA" && (
            <div className="mt-3 border-l-2 border-verde pl-3">
              <p className="text-xs text-muted-foreground">
                Realizado: {rango(encuentro.realizado_en, encuentro.fin_real_en)}
              </p>
              <p className="mt-0.5 whitespace-pre-line">{encuentro.resultado}</p>
            </div>
          )}

          {encuentro.motivo_cancelacion && (
            <div className="mt-3 border-l-2 border-naranjo pl-3">
              <p className="text-xs text-muted-foreground">Motivo de la cancelación</p>
              <p className="mt-0.5 whitespace-pre-line">{encuentro.motivo_cancelacion}</p>
            </div>
          )}

          <h3 className="mt-4 text-sm font-semibold">Asistentes</h3>
          <ul className="mt-1 divide-y divide-border border-t border-border">
            {encuentro.asistentes.map((a) => (
              <li
                key={a.participacion_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {a.nombre}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {NOMBRE_ROL_ASISTENTE[a.rol] ?? a.rol}
                  </span>
                </span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {NOMBRE_ASISTENCIA[a.estado_asistencia] ?? a.estado_asistencia}
                </span>
              </li>
            ))}
          </ul>

          {(encuentro.actas.length > 0 || conActa(encuentro)) && (
            <>
              <h3 className="mt-4 text-sm font-semibold">Actas firmadas</h3>
              {encuentro.actas.length === 0 ? (
                <p className="mt-1 text-muted-foreground">
                  Todavía no se adjunta el acta firmada.
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-border border-t border-border">
                  {encuentro.actas.map((acta) => (
                    <li
                      key={acta.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{acta.titulo}</p>
                        {acta.descripcion && (
                          <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                            {acta.descripcion}
                          </p>
                        )}
                        <p className="mt-0.5 break-all text-xs text-muted-foreground">
                          {[
                            `Fecha del acta: ${formatearDia(acta.fecha_documento)}`,
                            acta.archivo,
                            `${acta.creado_por}, ${formatearFecha(acta.creado_en)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {acta.archivo && (
                        <a
                          href={`/convivencia/evidencias/${acta.id}`}
                          className={`shrink-0 ${claseEnlace}`}
                        >
                          <span className="inline-flex items-center gap-1.5"><Icono nombre="descargar" className="size-4 shrink-0" />Descargar</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {conActa(encuentro) &&
                (adjuntar === encuentro.id ? (
                  <div className="mt-3 rounded-xl border border-border bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold">
                      Adjuntar el acta firmada
                    </h3>
                    <FormularioEvidencia
                      destino="convivencia-acta"
                      registroId={caso.id}
                      encuentroId={encuentro.id}
                      hoy={caso.hoy}
                    />
                  </div>
                ) : (
                  <Link
                    href={`${ruta}?seccion=encuentros&adjuntar=${encuentro.id}#encuentro-${encuentro.id}`}
                    scroll={false}
                    className={`mt-2 ${claseBotonSecundario}`}
                  >
                    <EtiquetaAccion icono="adjuntar">Adjuntar acta firmada</EtiquetaAccion>
                  </Link>
                ))}
            </>
          )}

          {abierto && ABIERTO.includes(encuentro.estado) && (
            <AccionesEncuentro caso={caso} encuentro={encuentro} abrirRealizacion={seleccionado === encuentro.id} />
          )}
        </details>
      ))}
    </>
  );
}

function AccionesEncuentro({ caso, encuentro, abrirRealizacion }: {
  caso: DetalleCaso;
  encuentro: Encuentro;
  abrirRealizacion: boolean;
}) {
  // Solo se ofrecen las personas que todavía no asisten con ese rol.
  const posibles = caso.opciones_encuentro.asistentes.filter(
    (p) =>
      !encuentro.asistentes.some(
        (a) => a.rol === p.rol && a.persona_id === p.persona_id,
      ),
  );
  return (
    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
      <Desplegable icono="confirmar" titulo="Registrar como realizado" abierto={abrirRealizacion}>
        <FormularioRealizacion
          casoId={caso.id}
          encuentroId={encuentro.id}
          version={encuentro.version}
          ahora={caso.ahora}
          asistentes={encuentro.asistentes}
        />
      </Desplegable>
      <Desplegable icono="anios" titulo="Reprogramar">
        <FormularioReprogramacion
          casoId={caso.id}
          encuentroId={encuentro.id}
          version={encuentro.version}
          programado={encuentro.programado_local}
          finProgramado={encuentro.fin_programado_local}
        />
      </Desplegable>
      <Desplegable icono="agregar" titulo="Agregar asistentes">
        <FormularioAgregarAsistentes
          casoId={caso.id}
          encuentroId={encuentro.id}
          posibles={posibles}
        />
      </Desplegable>
      <Desplegable icono="cerrar" titulo="Cancelar">
        <FormularioCancelacionEncuentro
          casoId={caso.id}
          encuentroId={encuentro.id}
          version={encuentro.version}
        />
      </Desplegable>
    </div>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
