"use client";

import { useActionState, type ReactNode } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import type { Categoria, EstudianteDelCurso } from "../../../datos";
import {
  LARGO_MAXIMO_SITUACION,
  OPCIONES_URGENCIA,
  ROLES_EN_SITUACION,
} from "../../../situacion-opciones";
import { registrarSituacion, type EstadoRegistro } from "./acciones";

const estadoInicial: EstadoRegistro = {};

// Mismo aspecto que Campo (components/formulario.tsx), para select y textarea.
const claseControl =
  "block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15";

function borde(error?: string) {
  return error ? "border-destructive" : "border-input";
}

// PB-042 (HU-035): formulario de registro. La API vuelve a validar cada dato;
// aquí solo se muestran sus mensajes junto al campo correspondiente (CA5).
export function FormularioSituacion({
  cursoId,
  estudiantes,
  categorias,
}: {
  cursoId: string;
  estudiantes: EstudianteDelCurso[];
  categorias: Categoria[];
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarSituacion,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const urgencia = valores.urgencia || "NORMAL";

  return (
    <form action={accion} noValidate className="max-w-3xl space-y-6">
      <input type="hidden" name="curso_id" value={cursoId} />
      {(estado.mensaje || errores.curso_id) && (
        <AvisoError>{errores.curso_id ?? estado.mensaje}</AvisoError>
      )}

      <Bloque titulo="Qué ocurrió">
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="ocurrido_en"
            etiqueta="Fecha y hora del hecho"
            type="datetime-local"
            required
            defaultValue={valores.ocurrido_en}
            error={errores.ocurrido_en}
          />
          <Campo
            name="lugar"
            etiqueta="Lugar (opcional)"
            maxLength={LARGO_MAXIMO_SITUACION.lugar}
            placeholder="Por ejemplo: patio central"
            defaultValue={valores.lugar}
            error={errores.lugar}
          />
        </div>

        <div>
          <label htmlFor="categoria_id" className="block text-sm font-medium">
            Categoría (opcional)
          </label>
          <select
            id="categoria_id"
            name="categoria_id"
            defaultValue={valores.categoria_id ?? ""}
            aria-invalid={errores.categoria_id ? true : undefined}
            aria-describedby={
              errores.categoria_id ? "categoria_id-error" : undefined
            }
            className={`mt-1.5 ${claseControl} ${borde(errores.categoria_id)}`}
          >
            <option value="">Sin categoría: la define Convivencia</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          <Mensaje id="categoria_id" error={errores.categoria_id} />
        </div>

        <fieldset
          aria-describedby={errores.urgencia ? "urgencia-error" : "urgencia-ayuda"}
        >
          <legend className="text-sm font-medium">Urgencia</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {OPCIONES_URGENCIA.map((opcion) => (
              <label
                key={opcion.valor}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="radio"
                  name="urgencia"
                  value={opcion.valor}
                  defaultChecked={urgencia === opcion.valor}
                  className="accent-primary"
                />
                {opcion.texto}
              </label>
            ))}
          </div>
          <Mensaje
            id="urgencia"
            error={errores.urgencia}
            ayuda="Queda en Normal salvo que la marques como Urgente o Inmediata."
          />
        </fieldset>

        <div>
          <label htmlFor="descripcion" className="block text-sm font-medium">
            Descripción
          </label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={6}
            required
            maxLength={LARGO_MAXIMO_SITUACION.descripcion}
            defaultValue={valores.descripcion}
            aria-invalid={errores.descripcion ? true : undefined}
            aria-describedby={
              errores.descripcion ? "descripcion-error" : "descripcion-ayuda"
            }
            className={`mt-1.5 ${claseControl} ${borde(errores.descripcion)}`}
          />
          <Mensaje
            id="descripcion"
            error={errores.descripcion}
            ayuda="Cuenta los hechos como ocurrieron. Una vez enviada no se puede editar: si Convivencia necesita más información, te pedirá una aclaración."
          />
        </div>
      </Bloque>

      <Bloque titulo="Estudiantes participantes">
        <fieldset
          aria-describedby={
            errores.participantes ? "participantes-error" : "participantes-ayuda"
          }
        >
          <legend className="sr-only">Rol de cada estudiante en el hecho</legend>
          <Mensaje
            id="participantes"
            ayuda="Elige el rol de cada estudiante que participó. Los demás quedan como «No participa»."
          />
          <ul
            className={`mt-3 divide-y divide-border rounded-xl border ${
              errores.participantes ? "border-destructive" : "border-border"
            }`}
          >
            {estudiantes.map((estudiante) => {
              const campo = `rol:${estudiante.id}`;
              return (
                <li
                  key={estudiante.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label htmlFor={campo} className="text-sm font-medium">
                    {estudiante.apellidos}, {estudiante.nombres}
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                      {estudiante.codigo_estudiante}
                    </span>
                  </label>
                  <select
                    id={campo}
                    name={campo}
                    defaultValue={valores[campo] ?? ""}
                    className={`${claseControl} border-input sm:w-44`}
                  >
                    <option value="">No participa</option>
                    {ROLES_EN_SITUACION.map((rol) => (
                      <option key={rol.valor} value={rol.valor}>
                        {rol.texto}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <Mensaje id="participantes" error={errores.participantes} />
        </fieldset>
      </Bloque>

      <BotonEnviar pendiente={pendiente} textoPendiente="Registrando…">
        Registrar situación
      </BotonEnviar>
    </form>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-tarjeta sm:p-6">
      <h2 className="text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

// Muestra el error del campo o, si no hay, su texto de ayuda. El id coincide
// con el aria-describedby del control.
function Mensaje({
  id,
  error,
  ayuda,
}: {
  id: string;
  error?: string;
  ayuda?: string;
}) {
  if (error) {
    return (
      <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!ayuda) return null;
  return (
    <p id={`${id}-ayuda`} className="mt-1.5 text-sm text-muted-foreground">
      {ayuda}
    </p>
  );
}