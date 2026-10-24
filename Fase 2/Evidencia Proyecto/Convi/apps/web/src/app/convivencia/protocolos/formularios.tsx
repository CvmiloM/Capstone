"use client";

import { useActionState, type ReactNode } from "react";
import {
  AvisoError,
  claseBotonPrimario,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  crearProtocolo,
  crearVersion,
  guardarDatosVersion,
  guardarPaso,
  publicarVersion,
  type EstadoAccion,
} from "./acciones";
import { LARGOS, UNIDADES_PLAZO } from "./opciones";

const estadoInicial: EstadoAccion = {};

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15";

/** Etiqueta, control y mensaje de error o ayuda de un campo. */
function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-ayuda`} className="mt-1.5 text-sm text-muted-foreground">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}

/** Atributos de accesibilidad y borde de un control según su error. */
function propsControl(id: string, nombre: string, error?: string, ayuda?: boolean) {
  return {
    id,
    name: nombre,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined,
    className: `${claseControl} ${error ? "border-destructive" : "border-input"}`,
  };
}

// PB-081 (HU-070 CA1): protocolo nuevo, que nace con su versión 1 en Borrador.
export function FormularioProtocolo() {
  const [estado, accion, pendiente] = useActionState(crearProtocolo, estadoInicial);
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  return (
    <form action={accion} noValidate className="space-y-4">
      {estado.mensaje && !estado.errores && <AvisoError>{estado.mensaje}</AvisoError>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          id="codigo"
          etiqueta="Código"
          error={errores.codigo}
          ayuda="Corto y único, por ejemplo P-ACOSO."
        >
          <input
            {...propsControl("codigo", "codigo", errores.codigo, true)}
            type="text"
            maxLength={LARGOS.codigo}
            defaultValue={valores.codigo}
          />
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="nombre" etiqueta="Nombre" error={errores.nombre}>
            <input
              {...propsControl("nombre", "nombre", errores.nombre)}
              type="text"
              maxLength={LARGOS.nombre}
              placeholder="Por ejemplo: Protocolo de actuación ante acoso escolar"
              defaultValue={valores.nombre}
            />
          </Campo>
        </div>
      </div>
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Creando…" : "Crear protocolo"}
      </button>
    </form>
  );
}

// HU-070 CA5: versión nueva en Borrador, con los pasos de la última.
export function BotonNuevaVersion({ protocoloId }: { protocoloId: string }) {
  const [estado, accion, pendiente] = useActionState(crearVersion, estadoInicial);
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="protocolo_id" value={protocoloId} />
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente ? "Creando…" : "Crear una versión nueva"}
      </button>
    </form>
  );
}

// HU-070 CA1: documento de origen y notas de la versión en Borrador. Los
// documentos se cargan en PB-078; para publicar hace falta uno.
export function FormularioDatosVersion({
  versionId,
  documentoActual,
  notasActuales,
  documentos,
}: {
  versionId: string;
  documentoActual: string | null;
  notasActuales: string | null;
  documentos: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    guardarDatosVersion,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="version_id" value={versionId} />
      {estado.mensaje && !estado.errores && <AvisoError>{estado.mensaje}</AvisoError>}
      <Campo
        id="version_documento_origen_id"
        etiqueta="Documento de origen"
        error={errores.version_documento_origen_id}
        ayuda={
          documentos.length === 0
            ? "Todavía no hay documentos institucionales cargados en la escuela. Puedes preparar el borrador; para publicarlo hará falta su documento de origen."
            : "El reglamento u otro documento del que sale este protocolo."
        }
      >
        <select
          {...propsControl(
            "version_documento_origen_id",
            "version_documento_origen_id",
            errores.version_documento_origen_id,
            true,
          )}
          defaultValue={valores.version_documento_origen_id ?? documentoActual ?? ""}
        >
          <option value="">Sin documento por ahora</option>
          {documentos.map((documento) => (
            <option key={documento.id} value={documento.id}>
              {documento.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id="notas" etiqueta="Notas (opcional)" error={errores.notas}>
        <textarea
          {...propsControl("notas", "notas", errores.notas)}
          rows={3}
          maxLength={LARGOS.notas}
          defaultValue={valores.notas ?? notasActuales ?? ""}
        />
      </Campo>
      <button type="submit" disabled={pendiente} className={claseBotonSecundario}>
        {pendiente ? "Guardando…" : "Guardar datos de la versión"}
      </button>
    </form>
  );
}

// HU-070 CA2 y CA3: agrega o edita un paso. El responsable previsto es
// siempre Convivencia; si otra persona realiza la acción, va en la descripción.
// Cada formulario usa su propio prefijo de id, porque puede haber varios.
export function FormularioPaso({
  versionId,
  paso,
  ordenSugerido,
}: {
  versionId: string;
  paso?: {
    id: string;
    orden_paso: number;
    nombre: string;
    descripcion: string | null;
    valor_plazo: number | null;
    unidad_plazo: string | null;
    requiere_evidencia: boolean;
    es_obligatorio: boolean;
  };
  ordenSugerido?: number;
}) {
  const [estado, accion, pendiente] = useActionState(guardarPaso, estadoInicial);
  const valores = estado.valores;
  const errores = estado.errores ?? {};
  const p = paso ? `paso-${paso.id}` : "paso-nuevo";
  // Si hubo un error se conserva lo enviado; si no, lo que tiene el paso.
  const inicial = {
    orden_paso: valores?.orden_paso ?? String(paso?.orden_paso ?? ordenSugerido ?? 1),
    nombre: valores?.nombre ?? paso?.nombre ?? "",
    descripcion: valores?.descripcion ?? paso?.descripcion ?? "",
    valor_plazo: valores?.valor_plazo ?? (paso?.valor_plazo ?? "").toString(),
    unidad_plazo: valores?.unidad_plazo ?? paso?.unidad_plazo ?? "",
    requiere_evidencia: valores
      ? valores.requiere_evidencia === "on"
      : (paso?.requiere_evidencia ?? false),
    es_obligatorio: valores
      ? valores.es_obligatorio === "on"
      : (paso?.es_obligatorio ?? true),
  };

  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="version_id" value={versionId} />
      {paso && <input type="hidden" name="paso_id" value={paso.id} />}
      {estado.mensaje && !estado.errores && <AvisoError>{estado.mensaje}</AvisoError>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Campo id={`${p}-orden`} etiqueta="Orden" error={errores.orden_paso}>
          <input
            {...propsControl(`${p}-orden`, "orden_paso", errores.orden_paso)}
            type="number"
            min={1}
            max={LARGOS.ordenPaso}
            defaultValue={inicial.orden_paso}
          />
        </Campo>
        <div className="sm:col-span-3">
          <Campo id={`${p}-nombre`} etiqueta="Nombre del paso" error={errores.nombre}>
            <input
              {...propsControl(`${p}-nombre`, "nombre_paso", errores.nombre)}
              type="text"
              maxLength={LARGOS.nombrePaso}
              defaultValue={inicial.nombre}
            />
          </Campo>
        </div>
      </div>
      <Campo
        id={`${p}-descripcion`}
        etiqueta="Descripción (opcional)"
        error={errores.descripcion}
        ayuda="El responsable previsto es Convivencia. Si el reglamento indica que lo hace otra persona, por ejemplo el profesor jefe, escríbelo aquí."
      >
        <textarea
          {...propsControl(`${p}-descripcion`, "descripcion_paso", errores.descripcion, true)}
          rows={2}
          maxLength={LARGOS.descripcionPaso}
          defaultValue={inicial.descripcion}
        />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-4">
        <Campo id={`${p}-plazo`} etiqueta="Plazo (opcional)" error={errores.valor_plazo}>
          <input
            {...propsControl(`${p}-plazo`, "valor_plazo", errores.valor_plazo)}
            type="number"
            min={0}
            defaultValue={inicial.valor_plazo}
          />
        </Campo>
        <Campo id={`${p}-unidad`} etiqueta="Unidad" error={errores.unidad_plazo}>
          <select
            {...propsControl(`${p}-unidad`, "unidad_plazo", errores.unidad_plazo)}
            defaultValue={inicial.unidad_plazo}
          >
            <option value="">Sin plazo</option>
            {UNIDADES_PLAZO.map((unidad) => (
              <option key={unidad.valor} value={unidad.valor}>
                {unidad.texto}
              </option>
            ))}
          </select>
        </Campo>
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm sm:col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="es_obligatorio"
              defaultChecked={inicial.es_obligatorio}
              className="accent-primary"
            />
            Es obligatorio
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="requiere_evidencia"
              defaultChecked={inicial.requiere_evidencia}
              className="accent-primary"
            />
            Exige evidencia para completarlo
          </label>
        </div>
      </div>
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Guardando…" : paso ? "Guardar cambios del paso" : "Agregar paso"}
      </button>
    </form>
  );
}

// PB-083 (HU-072 CA1): publicar exige pasos y documento de origen; el revisor
// y la fecha de publicación los registra el servidor.
export function FormularioPublicacion({
  versionId,
  hoy,
}: {
  versionId: string;
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(publicarVersion, estadoInicial);
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const faltan = [errores.pasos, errores.version_documento_origen_id].filter(Boolean);
  return (
    <form action={accion} noValidate className="space-y-4">
      <input type="hidden" name="version_id" value={versionId} />
      {estado.mensaje && (faltan.length > 0 || !estado.errores) && (
        <AvisoError>
          {estado.mensaje}
          {faltan.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {faltan.map((texto) => (
                <li key={texto}>{texto}</li>
              ))}
            </ul>
          )}
        </AvisoError>
      )}
      <Campo
        id="vigente_desde"
        etiqueta="Rige desde"
        error={errores.vigente_desde}
        ayuda="La versión publicada antes deja de regir el día anterior. Los casos que ya la aplicaron la conservan."
      >
        <input
          {...propsControl("vigente_desde", "vigente_desde", errores.vigente_desde, true)}
          type="date"
          defaultValue={valores.vigente_desde ?? hoy}
          className={`${claseControl} sm:w-56 ${errores.vigente_desde ? "border-destructive" : "border-input"}`}
        />
      </Campo>
      <p className="text-sm text-muted-foreground">
        Al publicar quedas como revisor con la fecha de hoy. Una versión
        publicada no vuelve a borrador y sus pasos no cambian: para modificarla
        se crea una versión nueva.
      </p>
      <button type="submit" disabled={pendiente} className={claseBotonPrimario}>
        {pendiente ? "Publicando…" : "Publicar versión"}
      </button>
    </form>
  );
}
