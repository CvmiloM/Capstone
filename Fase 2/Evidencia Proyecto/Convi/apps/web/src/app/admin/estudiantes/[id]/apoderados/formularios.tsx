"use client";

import {
  useActionState,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  AvisoError,
  BotonEnviar,
  Campo,
  claseBotonSecundario,
} from "@/app/components/formulario";
import {
  corregirContacto,
  terminarVinculo,
  vincularApoderado,
  buscarPersonasApoderadas,
  type EstadoFormulario,
} from "../../acciones";
import type { PersonaApoderada, VinculoApoderado } from "../../datos";

export function AgregarApoderado({
  estudianteId,
  personasIniciales,
  buscarInicial,
}: {
  estudianteId: string;
  personasIniciales: PersonaApoderada[];
  buscarInicial: string;
}) {
  const [buscar, setBuscar] = useState(buscarInicial);
  const [personas, setPersonas] = useState(personasIniciales);
  const [mensaje, setMensaje] = useState("");
  const [buscando, iniciarBusqueda] = useTransition();

  function enviarBusqueda(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const texto = buscar.trim();
    if (texto.length < 2) {
      setMensaje("Escribe al menos 2 caracteres para buscar");
      return;
    }
    setPersonas([]);
    setMensaje("");
    iniciarBusqueda(async () => {
      try {
        const resultado = await buscarPersonasApoderadas(estudianteId, texto);
        if (!resultado.ok) {
          setMensaje(resultado.mensaje);
          return;
        }
        setPersonas(resultado.personas);
        setMensaje(
          resultado.personas.length
            ? `${resultado.personas.length} ${resultado.personas.length === 1 ? "persona disponible" : "personas disponibles"} para «${texto}»`
            : `No encontramos personas disponibles para «${texto}», las ya vinculadas con este estudiante no aparecen en la búsqueda`,
        );
      } catch {
        setMensaje("No pudimos completar la búsqueda, inténtalo nuevamente");
      }
    });
  }

  return (
    <>
      <form
        onSubmit={enviarBusqueda}
        role="search"
        className="mb-5 space-y-3 rounded-xl bg-muted p-4"
      >
        <Campo
          name="buscar"
          etiqueta="Buscar persona registrada"
          type="search"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          disabled={buscando}
          required
          minLength={2}
          maxLength={100}
          ayuda="Nombre, RUT sin puntos o correo, se muestran hasta 20 resultados"
        />
        <button
          type="submit"
          disabled={buscando || buscar.trim().length < 2}
          className={`${claseBotonSecundario} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {buscando ? "Buscando…" : "Buscar persona"}
        </button>
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {buscando
            ? "Buscando personas, los vínculos registrados se mantienen"
            : mensaje}
        </p>
      </form>
      <FormularioVinculo
        estudianteId={estudianteId}
        personas={personas}
        buscar=""
      />
    </>
  );
}

export function FormularioVinculo({
  estudianteId,
  personas,
  buscar,
}: {
  estudianteId: string;
  personas: PersonaApoderada[];
  buscar: string;
}) {
  const [estado, accion, pendiente] = useActionState<
    EstadoFormulario,
    FormData
  >(
    vincularApoderado.bind(null, estudianteId),
    {},
    `/admin/estudiantes/${estudianteId}/apoderados${buscar ? `?${new URLSearchParams({ buscar })}` : ""}`,
  );
  const [seleccion, setModo] = useState<string | null>(null);
  const valores = estado.valores ?? {};
  const modo = seleccion ?? valores.modo ?? "existente";
  const errores = estado.errores ?? {};
  return (
    <form
      action={accion}
      noValidate
      onReset={(evento) => evento.preventDefault()}
      className="space-y-5"
    >
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Persona apoderada</legend>
        {[
          ["existente", "Usar una persona registrada"],
          ["nueva", "Registrar una persona nueva"],
        ].map(([valor, nombre]) => (
          <label
            key={valor}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-input p-3 text-sm"
          >
            <input
              type="radio"
              name="modo"
              value={valor}
              checked={modo === valor}
              onChange={() => setModo(valor)}
              className="accent-primary"
            />
            {nombre}
          </label>
        ))}
      </fieldset>
      {modo === "existente" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            Resultados de la búsqueda
          </legend>
          {personas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Busca arriba por nombre, RUT o correo, si no existe su ficha
              puedes registrar una persona nueva
            </p>
          )}
          {personas.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-input p-3 text-sm"
            >
              <input
                type="radio"
                name="persona_apoderado_id"
                value={p.id}
                defaultChecked={valores.persona_apoderado_id === p.id}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block font-medium">
                  {p.nombres} {p.apellidos}
                </span>
                <span className="text-muted-foreground">
                  {[p.rut, p.correo, p.telefono].filter(Boolean).join(" · ") ||
                    "Sin datos de contacto"}
                </span>
              </span>
            </label>
          ))}
          {errores.persona_apoderado_id && (
            <p role="alert" className="text-sm text-destructive">
              {errores.persona_apoderado_id}
            </p>
          )}
        </fieldset>
      ) : (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-medium">
            Datos de la persona
          </legend>
          <Campo
            name="nombres"
            etiqueta="Nombres"
            required
            maxLength={100}
            defaultValue={valores.nombres}
            error={errores.nombres}
          />
          <Campo
            name="apellidos"
            etiqueta="Apellidos"
            required
            maxLength={120}
            defaultValue={valores.apellidos}
            error={errores.apellidos}
          />
          <Campo
            name="rut"
            etiqueta="RUT (opcional)"
            defaultValue={valores.rut}
            error={errores.rut}
          />
          <Campo
            name="correo"
            etiqueta="Correo (opcional)"
            type="email"
            maxLength={180}
            defaultValue={valores.correo}
            error={errores.correo}
          />
          <Campo
            name="telefono"
            etiqueta="Teléfono (opcional)"
            type="tel"
            maxLength={40}
            defaultValue={valores.telefono}
            error={errores.telefono}
          />
          <Campo
            name="direccion"
            etiqueta="Dirección (opcional)"
            maxLength={200}
            defaultValue={valores.direccion}
            error={errores.direccion}
          />
        </fieldset>
      )}
      <Campo
        name="tipo_relacion"
        etiqueta="Relación con el estudiante"
        ayuda="Escríbela como corresponda, por ejemplo madre, padre, abuela o tutor"
        required
        maxLength={60}
        defaultValue={valores.tipo_relacion}
        error={errores.tipo_relacion}
      />
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="es_principal"
            defaultChecked={valores.es_principal === "1"}
            className="accent-primary"
          />
          Es apoderado principal
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="puede_ser_contactado"
            defaultChecked={valores.puede_ser_contactado !== "0"}
            className="accent-primary"
          />
          Puede ser contactado
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          name="activo_desde"
          etiqueta="Desde (opcional)"
          type="date"
          defaultValue={valores.activo_desde}
          error={errores.activo_desde}
        />
        <Campo
          name="activo_hasta"
          etiqueta="Hasta (opcional)"
          type="date"
          defaultValue={valores.activo_hasta}
          error={errores.activo_hasta}
        />
      </div>
      <BotonEnviar pendiente={pendiente} textoPendiente="Guardando vínculo…">
        Guardar vínculo
      </BotonEnviar>
    </form>
  );
}

export function FormularioTermino({
  estudianteId,
  vinculoId,
  desde,
  hoy,
}: {
  estudianteId: string;
  vinculoId: string;
  desde: string | null;
  hoy: string;
}) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<
    EstadoFormulario,
    FormData
  >(
    terminarVinculo.bind(null, estudianteId, vinculoId),
    {},
    `/admin/estudiantes/${estudianteId}/apoderados?termino=${vinculoId}`,
  );
  return (
    <details className="mt-4 text-sm">
      <summary className="w-fit cursor-pointer font-medium text-primary">
        Registrar término del vínculo
      </summary>
      <form action={accion} noValidate className="mt-3 space-y-3">
        <p className="text-muted-foreground">
          El vínculo se conserva en la ficha, la fecha indicada será su último
          día de vigencia
        </p>
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
        <Campo
          id={id}
          name="activo_hasta"
          etiqueta="Último día de vigencia"
          type="date"
          min={desde ?? undefined}
          defaultValue={
            estado.valores?.activo_hasta ?? (desde && desde > hoy ? desde : hoy)
          }
          error={estado.errores?.activo_hasta}
          required
        />
        <BotonEnviar pendiente={pendiente} textoPendiente="Guardando término…">
          Confirmar término
        </BotonEnviar>
      </form>
    </details>
  );
}

// PB-021 (HU-016): corrige los datos de la persona, no el vínculo. Si la API
// rechaza algo, el formulario queda abierto con lo escrito y sus errores.
export function FormularioContacto({
  estudianteId,
  vinculo,
}: {
  estudianteId: string;
  vinculo: VinculoApoderado;
}) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<
    EstadoFormulario,
    FormData
  >(
    corregirContacto.bind(null, estudianteId, vinculo.id),
    {},
    `/admin/estudiantes/${estudianteId}/apoderados?corregir=${vinculo.id}`,
  );
  const valores = estado.valores ?? {
    nombres: vinculo.nombres,
    apellidos: vinculo.apellidos,
    rut: vinculo.rut ?? "",
    correo: vinculo.correo ?? "",
    telefono: vinculo.telefono ?? "",
    direccion: vinculo.direccion ?? "",
  };
  const errores = estado.errores ?? {};
  return (
    <details className="mt-4 text-sm" open={Boolean(estado.mensaje)}>
      <summary className="w-fit cursor-pointer font-medium text-primary">
        Corregir datos del contacto
      </summary>
      <form action={accion} noValidate className="mt-3 space-y-4">
        <p className="text-muted-foreground">
          Corrige cómo está escrita su ficha, el cambio queda registrado con tu
          nombre y la fecha. Si es otra persona, agrégala como un apoderado
          nuevo
        </p>
        {vinculo.otros_estudiantes > 0 && (
          <p className="rounded-xl bg-muted p-3 text-muted-foreground">
            También es apoderado de{" "}
            {vinculo.otros_estudiantes === 1
              ? "otro estudiante"
              : `${vinculo.otros_estudiantes} estudiantes más`}
            , la corrección se verá en todas sus fichas
          </p>
        )}
        {vinculo.tiene_cuenta && (
          <p className="rounded-xl bg-muted p-3 text-muted-foreground">
            Tiene una cuenta en CONVI, esta corrección no cambia el correo con
            el que ingresa
          </p>
        )}
        {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id={`${id}-nombres`}
            name="nombres"
            etiqueta="Nombres"
            required
            maxLength={100}
            defaultValue={valores.nombres}
            error={errores.nombres}
          />
          <Campo
            id={`${id}-apellidos`}
            name="apellidos"
            etiqueta="Apellidos"
            required
            maxLength={120}
            defaultValue={valores.apellidos}
            error={errores.apellidos}
          />
          <Campo
            id={`${id}-rut`}
            name="rut"
            etiqueta="RUT (opcional)"
            defaultValue={valores.rut}
            error={errores.rut}
          />
          <Campo
            id={`${id}-correo`}
            name="correo"
            etiqueta="Correo (opcional)"
            type="email"
            maxLength={180}
            defaultValue={valores.correo}
            error={errores.correo}
          />
          <Campo
            id={`${id}-telefono`}
            name="telefono"
            etiqueta="Teléfono (opcional)"
            type="tel"
            maxLength={40}
            defaultValue={valores.telefono}
            error={errores.telefono}
          />
          <Campo
            id={`${id}-direccion`}
            name="direccion"
            etiqueta="Dirección (opcional)"
            maxLength={200}
            defaultValue={valores.direccion}
            error={errores.direccion}
          />
        </div>
        <BotonEnviar
          pendiente={pendiente}
          textoPendiente="Guardando corrección…"
        >
          Guardar corrección
        </BotonEnviar>
      </form>
    </details>
  );
}
