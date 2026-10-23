"use client";

import { useActionState, useState } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import { OPCIONES_URGENCIA } from "@/app/profesor/situacion-opciones";
import { APLICABILIDAD, MODO_REVISION, MOTIVOS_DESCARTE } from "./opciones";
import {
  abrirCaso,
  asignarResponsable,
  cambiarUrgencia,
  iniciarRevision,
  pedirAclaracion,
  registrarDecision,
  registrarRevisionNormativa,
  type EstadoAccion,
} from "./acciones";

const estadoInicial: EstadoAccion = {};

// Mismos límites que valida la API (cambio-urgencia.ts, nueva-aclaracion.ts,
// revision-normativa.ts y decision-situacion.ts).
const LARGO_MAXIMO_MOTIVO = 500;
const LARGO_MAXIMO_PREGUNTA = 2000;
const LARGO_MAXIMO_FUNDAMENTO = 4000;
const LARGO_MAXIMO_FUNDAMENTO_DECISION = 2000;
// caso-nuevo.ts
const LARGO_MAXIMO_TITULO = 220;
const LARGO_MAXIMO_RESUMEN = 4000;
const LARGO_MAXIMO_JUSTIFICACION = 2000;
const LARGO_MAXIMO_SECCION = 220;
const MAXIMO_REFERENCIAS = 10;

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15";

// HU-037 CA2: botón para empezar la revisión de una situación Nueva.
export function FormularioRevision({ situacionId }: { situacionId: string }) {
  const [estado, accion, pendiente] = useActionState(
    iniciarRevision,
    estadoInicial,
  );
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="situacion_id" value={situacionId} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Iniciando…" : "Iniciar revisión"}
      </button>
    </form>
  );
}

// HU-037 CA3: cambio de urgencia con motivo obligatorio.
export function FormularioUrgencia({
  situacionId,
  urgenciaActual,
}: {
  situacionId: string;
  urgenciaActual: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    cambiarUrgencia,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const opciones = OPCIONES_URGENCIA.filter((o) => o.valor !== urgenciaActual);

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input type="hidden" name="urgencia_anterior" value={urgenciaActual} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div>
        <label htmlFor="urgencia" className="block text-sm font-medium">
          Nueva urgencia
        </label>
        <select
          id="urgencia"
          name="urgencia"
          defaultValue={valores.urgencia ?? ""}
          aria-invalid={errores.urgencia ? true : undefined}
          aria-describedby={errores.urgencia ? "urgencia-error" : undefined}
          className={`${claseControl} ${errores.urgencia ? "border-destructive" : "border-input"}`}
        >
          <option value="" disabled>
            Elige una urgencia
          </option>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
        {errores.urgencia && (
          <p id="urgencia-error" className="mt-1.5 text-sm text-destructive">
            {errores.urgencia}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="motivo" className="block text-sm font-medium">
          Motivo del cambio
        </label>
        <textarea
          id="motivo"
          name="motivo"
          rows={3}
          maxLength={LARGO_MAXIMO_MOTIVO}
          defaultValue={valores.motivo}
          aria-invalid={errores.motivo ? true : undefined}
          aria-describedby={errores.motivo ? "motivo-error" : "motivo-ayuda"}
          className={`${claseControl} ${errores.motivo ? "border-destructive" : "border-input"}`}
        />
        {errores.motivo ? (
          <p id="motivo-error" className="mt-1.5 text-sm text-destructive">
            {errores.motivo}
          </p>
        ) : (
          <p id="motivo-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            Queda registrado en la auditoría junto con quién hizo el cambio.
          </p>
        )}
      </div>

      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente ? "Guardando…" : "Cambiar urgencia"}
      </button>
    </form>
  );
}

// HU-039: asigna o cambia a quien revisa. La primera asignación no pide
// motivo; cambiar a quien ya estaba sí (CA3).
export function FormularioResponsable({
  situacionId,
  responsableActual,
  opciones,
}: {
  situacionId: string;
  responsableActual: string | null;
  opciones: { id: string; nombre: string; propia: boolean }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    asignarResponsable,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const disponibles = opciones.filter((o) => o.id !== responsableActual);

  if (disponibles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay otras cuentas activas del equipo de Convivencia para asignar.
      </p>
    );
  }

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input
        type="hidden"
        name="responsable_anterior_id"
        value={responsableActual ?? ""}
      />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div>
        <label htmlFor="responsable_id" className="block text-sm font-medium">
          {responsableActual ? "Nuevo responsable" : "Responsable"}
        </label>
        <select
          id="responsable_id"
          name="responsable_id"
          defaultValue={valores.responsable_id ?? ""}
          aria-invalid={errores.responsable_id ? true : undefined}
          aria-describedby={
            errores.responsable_id ? "responsable_id-error" : undefined
          }
          className={`${claseControl} ${errores.responsable_id ? "border-destructive" : "border-input"}`}
        >
          <option value="" disabled>
            Elige a una persona de Convivencia
          </option>
          {disponibles.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.propia ? `${opcion.nombre} (tú)` : opcion.nombre}
            </option>
          ))}
        </select>
        {errores.responsable_id && (
          <p
            id="responsable_id-error"
            className="mt-1.5 text-sm text-destructive"
          >
            {errores.responsable_id}
          </p>
        )}
      </div>

      {responsableActual && (
        <div>
          <label
            htmlFor="motivo_responsable"
            className="block text-sm font-medium"
          >
            Motivo del cambio
          </label>
          <textarea
            id="motivo_responsable"
            name="motivo"
            rows={3}
            maxLength={LARGO_MAXIMO_MOTIVO}
            defaultValue={valores.motivo}
            aria-invalid={errores.motivo ? true : undefined}
            aria-describedby={
              errores.motivo
                ? "motivo_responsable-error"
                : "motivo_responsable-ayuda"
            }
            className={`${claseControl} ${errores.motivo ? "border-destructive" : "border-input"}`}
          />
          {errores.motivo ? (
            <p
              id="motivo_responsable-error"
              className="mt-1.5 text-sm text-destructive"
            >
              {errores.motivo}
            </p>
          ) : (
            <p
              id="motivo_responsable-ayuda"
              className="mt-1.5 text-sm text-muted-foreground"
            >
              Queda registrado en la auditoría junto con quién hizo el cambio.
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente
          ? "Guardando…"
          : responsableActual
            ? "Cambiar responsable"
            : "Asignar responsable"}
      </button>
    </form>
  );
}

// HU-038: pregunta al profesor que registró la situación. Una vez enviada no
// se modifica (CA3).
export function FormularioAclaracion({
  situacionId,
  profesor,
}: {
  situacionId: string;
  profesor: string;
}) {
  const [estado, accion, pendiente] = useActionState(
    pedirAclaracion,
    estadoInicial,
  );
  const error = estado.errores?.pregunta;

  return (
    <form
      action={accion}
      noValidate
      className="mt-4 space-y-3 border-t border-border pt-4"
    >
      <input type="hidden" name="situacion_id" value={situacionId} />
      {estado.mensaje && !error && <AvisoError>{estado.mensaje}</AvisoError>}
      <div>
        <label htmlFor="pregunta" className="block text-sm font-medium">
          Pedir una aclaración a {profesor}
        </label>
        <textarea
          id="pregunta"
          name="pregunta"
          rows={3}
          maxLength={LARGO_MAXIMO_PREGUNTA}
          defaultValue={estado.valores?.pregunta}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "pregunta-error" : "pregunta-ayuda"}
          className={`${claseControl} ${error ? "border-destructive" : "border-input"}`}
        />
        {error ? (
          <p id="pregunta-error" className="mt-1.5 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p id="pregunta-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            La situación pasa a Información solicitada hasta que el profesor
            responda. La pregunta no se puede cambiar después de enviarla.
          </p>
        )}
      </div>
      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente ? "Enviando…" : "Pedir aclaración"}
      </button>
    </form>
  );
}

// HU-134: lo que indica el reglamento o el protocolo, antes de decidir. No
// cambia el estado de la situación (CA4) y no se edita después (CA5).
export function FormularioRevisionNormativa({
  situacionId,
  protocolos,
  documentos,
}: {
  situacionId: string;
  protocolos: { id: string; nombre: string }[];
  documentos: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarRevisionNormativa,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  // Si hubo un error se conservan las filas que se habían agregado.
  const filasEnviadas = Object.keys(valores).filter((campo) =>
    campo.startsWith("ref_documento_"),
  ).length;
  const [filas, setFilas] = useState<number | null>(null);
  const cantidad = filas ?? filasEnviadas;

  return (
    <form action={accion} noValidate className="space-y-5">
      <input type="hidden" name="situacion_id" value={situacionId} />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <fieldset
        aria-describedby={errores.aplicabilidad ? "aplicabilidad-error" : undefined}
      >
        <legend className="text-sm font-medium">¿La norma es aplicable?</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {Object.entries(APLICABILIDAD).map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="aplicabilidad"
                value={valor}
                defaultChecked={valores.aplicabilidad === valor}
                className="accent-primary"
              />
              {texto}
            </label>
          ))}
        </div>
        {errores.aplicabilidad && (
          <p id="aplicabilidad-error" className="mt-1.5 text-sm text-destructive">
            {errores.aplicabilidad}
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="fundamento" className="block text-sm font-medium">
          Qué indica la normativa
        </label>
        <textarea
          id="fundamento"
          name="fundamento"
          rows={4}
          maxLength={LARGO_MAXIMO_FUNDAMENTO}
          defaultValue={valores.fundamento}
          aria-invalid={errores.fundamento ? true : undefined}
          aria-describedby={errores.fundamento ? "fundamento-error" : "fundamento-ayuda"}
          className={`${claseControl} ${errores.fundamento ? "border-destructive" : "border-input"}`}
        />
        {errores.fundamento ? (
          <p id="fundamento-error" className="mt-1.5 text-sm text-destructive">
            {errores.fundamento}
          </p>
        ) : (
          <p id="fundamento-ayuda" className="mt-1.5 text-sm text-muted-foreground">
            Resume lo que dice el reglamento o el protocolo y por qué aplica o no.
            Queda registrado y no se puede editar después.
          </p>
        )}
      </div>

      {protocolos.length > 0 ? (
        <div>
          <label htmlFor="version_protocolo_id" className="block text-sm font-medium">
            Protocolo aplicable (opcional)
          </label>
          <select
            id="version_protocolo_id"
            name="version_protocolo_id"
            defaultValue={valores.version_protocolo_id ?? ""}
            aria-invalid={errores.version_protocolo_id ? true : undefined}
            aria-describedby={
              errores.version_protocolo_id ? "version_protocolo_id-error" : undefined
            }
            className={`${claseControl} ${errores.version_protocolo_id ? "border-destructive" : "border-input"}`}
          >
            <option value="">Sin protocolo</option>
            {protocolos.map((protocolo) => (
              <option key={protocolo.id} value={protocolo.id}>
                {protocolo.nombre}
              </option>
            ))}
          </select>
          {errores.version_protocolo_id && (
            <p
              id="version_protocolo_id-error"
              className="mt-1.5 text-sm text-destructive"
            >
              {errores.version_protocolo_id}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no hay protocolos publicados en la escuela para elegir uno.
        </p>
      )}

      {documentos.length > 0 ? (
        <fieldset
          aria-describedby={errores.referencias ? "referencias-error" : undefined}
        >
          <legend className="text-sm font-medium">
            Páginas consultadas (opcional)
          </legend>
          {Array.from({ length: cantidad }, (_, n) => (
            <div
              key={n}
              className="mt-3 grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-6"
            >
              <label className="text-xs text-muted-foreground sm:col-span-4">
                Documento y versión
                <select
                  name={`ref_documento_${n}`}
                  defaultValue={valores[`ref_documento_${n}`] ?? ""}
                  className={`${claseControl} border-input text-foreground`}
                >
                  <option value="">Elige un documento</option>
                  {documentos.map((documento) => (
                    <option key={documento.id} value={documento.id}>
                      {documento.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Desde la página
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  name={`ref_desde_${n}`}
                  defaultValue={valores[`ref_desde_${n}`]}
                  className={`${claseControl} border-input text-foreground`}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Hasta la página
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  name={`ref_hasta_${n}`}
                  defaultValue={valores[`ref_hasta_${n}`]}
                  className={`${claseControl} border-input text-foreground`}
                />
              </label>
              <label className="text-xs text-muted-foreground sm:col-span-6">
                Sección (obligatoria si no indicas la página)
                <input
                  type="text"
                  maxLength={LARGO_MAXIMO_SECCION}
                  name={`ref_seccion_${n}`}
                  defaultValue={valores[`ref_seccion_${n}`]}
                  className={`${claseControl} border-input text-foreground`}
                />
              </label>
            </div>
          ))}
          {errores.referencias && (
            <p id="referencias-error" className="mt-1.5 text-sm text-destructive">
              {errores.referencias}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {cantidad < MAXIMO_REFERENCIAS && (
              <button
                type="button"
                onClick={() => setFilas(cantidad + 1)}
                className={claseBotonSecundario}
              >
                Agregar página consultada
              </button>
            )}
            {cantidad > 0 && (
              <button
                type="button"
                onClick={() => setFilas(cantidad - 1)}
                className={claseBotonSecundario}
              >
                Quitar la última
              </button>
            )}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no hay reglamentos ni documentos publicados para citar sus
          páginas: escribe la referencia en el texto.
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-medium">¿Cómo hiciste la revisión?</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {Object.entries(MODO_REVISION).map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo_revision"
                value={valor}
                defaultChecked={(valores.modo_revision || "MANUAL") === valor}
                className="accent-primary"
              />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : "Guardar revisión normativa"}
      </button>
    </form>
  );
}

// HU-040, HU-041 y HU-044: cierra la revisión sin abrir un caso. La decisión
// no se edita después; cambiarla es una reconsideración (HU-043).
export function FormularioDecision({
  situacionId,
  ultimaRevisionId,
}: {
  situacionId: string;
  ultimaRevisionId: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarDecision,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  // Lo elegido se conserva para mostrar los campos que corresponden.
  const [elegido, setElegido] = useState<string | null>(null);
  const [motivoElegido, setMotivoElegido] = useState<string | null>(null);
  const resultado = elegido ?? valores.resultado ?? "";
  const motivo = motivoElegido ?? valores.motivo_descarte ?? "";
  const descarta = resultado === "DESCARTADA";

  return (
    <form action={accion} noValidate className="space-y-5">
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input
        type="hidden"
        name="revision_anterior_id"
        value={ultimaRevisionId ?? ""}
      />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <fieldset
        aria-describedby={errores.resultado ? "resultado-error" : undefined}
      >
        <legend className="text-sm font-medium">¿Qué decides?</legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="resultado"
              value="ANTECEDENTE"
              checked={resultado === "ANTECEDENTE"}
              onChange={() => setElegido("ANTECEDENTE")}
              className="mt-0.5 accent-primary"
            />
            <span>
              Guardar como antecedente
              <span className="block text-muted-foreground">
                Es válida y queda en el historial del estudiante, sin abrir un caso.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="resultado"
              value="DESCARTADA"
              checked={resultado === "DESCARTADA"}
              onChange={() => setElegido("DESCARTADA")}
              className="mt-0.5 accent-primary"
            />
            <span>
              Descartar
              <span className="block text-muted-foreground">
                Es un duplicado, un error o está fuera de alcance. No se borra.
              </span>
            </span>
          </label>
        </div>
        {errores.resultado && (
          <p id="resultado-error" className="mt-1.5 text-sm text-destructive">
            {errores.resultado}
          </p>
        )}
      </fieldset>

      {descarta && (
        <fieldset
          aria-describedby={
            errores.motivo_descarte ? "motivo_descarte-error" : undefined
          }
        >
          <legend className="text-sm font-medium">Motivo del descarte</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {MOTIVOS_DESCARTE.map((opcion) => (
              <label key={opcion.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="motivo_descarte"
                  value={opcion.valor}
                  checked={motivo === opcion.valor}
                  onChange={() => setMotivoElegido(opcion.valor)}
                  className="accent-primary"
                />
                {opcion.texto}
              </label>
            ))}
          </div>
          {errores.motivo_descarte && (
            <p
              id="motivo_descarte-error"
              className="mt-1.5 text-sm text-destructive"
            >
              {errores.motivo_descarte}
            </p>
          )}
        </fieldset>
      )}

      {descarta && motivo === "DUPLICADO" && (
        <div>
          <label htmlFor="codigo_original" className="block text-sm font-medium">
            Código de la situación original
          </label>
          <input
            id="codigo_original"
            name="codigo_original"
            type="text"
            placeholder="SIT-2026-00012"
            defaultValue={valores.codigo_original}
            aria-invalid={errores.codigo_original ? true : undefined}
            aria-describedby={
              errores.codigo_original
                ? "codigo_original-error"
                : "codigo_original-ayuda"
            }
            className={`${claseControl} font-mono sm:w-60 ${errores.codigo_original ? "border-destructive" : "border-input"}`}
          />
          {errores.codigo_original ? (
            <p
              id="codigo_original-error"
              className="mt-1.5 text-sm text-destructive"
            >
              {errores.codigo_original}
            </p>
          ) : (
            <p
              id="codigo_original-ayuda"
              className="mt-1.5 text-sm text-muted-foreground"
            >
              La situación que sí sigue su curso. Debe ser de tu escuela y
              distinta de esta.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="fundamento_decision" className="block text-sm font-medium">
          {descarta ? "Por qué se descarta" : "Conclusión de la revisión"}
        </label>
        <textarea
          id="fundamento_decision"
          name="fundamento_decision"
          rows={4}
          maxLength={LARGO_MAXIMO_FUNDAMENTO_DECISION}
          defaultValue={valores.fundamento}
          aria-invalid={errores.fundamento ? true : undefined}
          aria-describedby={
            errores.fundamento
              ? "fundamento_decision-error"
              : "fundamento_decision-ayuda"
          }
          className={`${claseControl} ${errores.fundamento ? "border-destructive" : "border-input"}`}
        />
        {errores.fundamento ? (
          <p
            id="fundamento_decision-error"
            className="mt-1.5 text-sm text-destructive"
          >
            {errores.fundamento}
          </p>
        ) : (
          <p
            id="fundamento_decision-ayuda"
            className="mt-1.5 text-sm text-muted-foreground"
          >
            Queda registrada con tu nombre y la fecha. Después no se puede editar.
          </p>
        )}
      </div>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente
          ? "Guardando…"
          : descarta
            ? "Descartar situación"
            : resultado === "ANTECEDENTE"
              ? "Guardar como antecedente"
              : "Guardar decisión"}
      </button>
    </form>
  );
}

// HU-046: abre un caso desde la situación, sin exigir protocolo. Si ya hay
// casos activos con los mismos estudiantes, se pide justificar uno nuevo (CA4).
export function FormularioCaso({
  situacionId,
  ultimaRevisionId,
  categorias,
  categoriaSugeridaId,
  hoy,
  responsables,
  responsableSugeridoId,
  hayCasosRelacionados,
}: {
  situacionId: string;
  ultimaRevisionId: string | null;
  categorias: { id: string; nombre: string }[];
  categoriaSugeridaId: string | null;
  hoy: string;
  responsables: { id: string; nombre: string; propia: boolean }[];
  responsableSugeridoId: string | null;
  hayCasosRelacionados: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(abrirCaso, estadoInicial);
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const categoriaInicial = categorias.some((c) => c.id === categoriaSugeridaId)
    ? (categoriaSugeridaId ?? "")
    : "";

  function mensajeError(campo: string) {
    return errores[campo] ? (
      <p id={`${campo}-error`} className="mt-1.5 text-sm text-destructive">
        {errores[campo]}
      </p>
    ) : null;
  }
  function borde(campo: string) {
    return errores[campo] ? "border-destructive" : "border-input";
  }

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="situacion_id" value={situacionId} />
      <input
        type="hidden"
        name="revision_anterior_id"
        value={ultimaRevisionId ?? ""}
      />
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <div>
        <label htmlFor="titulo" className="block text-sm font-medium">
          Título del caso
        </label>
        <input
          id="titulo"
          name="titulo"
          type="text"
          maxLength={LARGO_MAXIMO_TITULO}
          defaultValue={valores.titulo}
          aria-invalid={errores.titulo ? true : undefined}
          aria-describedby={errores.titulo ? "titulo-error" : undefined}
          className={`${claseControl} ${borde("titulo")}`}
        />
        {mensajeError("titulo")}
      </div>

      <div>
        <label htmlFor="resumen" className="block text-sm font-medium">
          Resumen
        </label>
        <textarea
          id="resumen"
          name="resumen"
          rows={4}
          maxLength={LARGO_MAXIMO_RESUMEN}
          defaultValue={valores.resumen}
          aria-invalid={errores.resumen ? true : undefined}
          aria-describedby={errores.resumen ? "resumen-error" : undefined}
          className={`${claseControl} ${borde("resumen")}`}
        />
        {mensajeError("resumen")}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="fecha_inicio" className="block text-sm font-medium">
            Fecha de inicio
          </label>
          <input
            id="fecha_inicio"
            name="fecha_inicio"
            type="date"
            max={hoy || undefined}
            defaultValue={valores.fecha_inicio ?? hoy}
            aria-invalid={errores.fecha_inicio ? true : undefined}
            aria-describedby={errores.fecha_inicio ? "fecha_inicio-error" : undefined}
            className={`${claseControl} ${borde("fecha_inicio")}`}
          />
          {mensajeError("fecha_inicio")}
        </div>

        <div>
          <label
            htmlFor="categoria_principal_id"
            className="block text-sm font-medium"
          >
            Categoría principal
          </label>
          <select
            id="categoria_principal_id"
            name="categoria_principal_id"
            defaultValue={valores.categoria_principal_id ?? categoriaInicial}
            aria-invalid={errores.categoria_principal_id ? true : undefined}
            aria-describedby={
              errores.categoria_principal_id
                ? "categoria_principal_id-error"
                : undefined
            }
            className={`${claseControl} ${borde("categoria_principal_id")}`}
          >
            <option value="">Sin categoría</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          {mensajeError("categoria_principal_id")}
        </div>

        <div>
          <label htmlFor="responsable_caso_id" className="block text-sm font-medium">
            Responsable del caso
          </label>
          <select
            id="responsable_caso_id"
            name="responsable_caso_id"
            defaultValue={valores.responsable_id ?? responsableSugeridoId ?? ""}
            aria-invalid={errores.responsable_id ? true : undefined}
            aria-describedby={
              errores.responsable_id ? "responsable_id-error" : undefined
            }
            className={`${claseControl} ${borde("responsable_id")}`}
          >
            <option value="" disabled>
              Elige a una persona de Convivencia
            </option>
            {responsables.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>
                {opcion.propia ? `${opcion.nombre} (tú)` : opcion.nombre}
              </option>
            ))}
          </select>
          {mensajeError("responsable_id")}
        </div>
      </div>

      {hayCasosRelacionados && (
        <div>
          <label
            htmlFor="justificacion_independiente"
            className="block text-sm font-medium"
          >
            Por qué abres un caso independiente
          </label>
          <textarea
            id="justificacion_independiente"
            name="justificacion_independiente"
            rows={3}
            maxLength={LARGO_MAXIMO_JUSTIFICACION}
            defaultValue={valores.justificacion_independiente}
            aria-invalid={errores.justificacion_independiente ? true : undefined}
            aria-describedby={
              errores.justificacion_independiente
                ? "justificacion_independiente-error"
                : "justificacion_independiente-ayuda"
            }
            className={`${claseControl} ${borde("justificacion_independiente")}`}
          />
          {errores.justificacion_independiente ? (
            mensajeError("justificacion_independiente")
          ) : (
            <p
              id="justificacion_independiente-ayuda"
              className="mt-1.5 text-sm text-muted-foreground"
            >
              Ya hay casos activos con estos estudiantes. Es obligatorio
              explicar por qué este hecho no se sigue en ellos.
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        El caso queda En análisis con su código, sin exigir un protocolo. Los
        estudiantes de la situación pasan al caso y la situación queda
        vinculada a él.
      </p>

      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Abriendo…" : "Abrir caso"}
      </button>
    </form>
  );
}
