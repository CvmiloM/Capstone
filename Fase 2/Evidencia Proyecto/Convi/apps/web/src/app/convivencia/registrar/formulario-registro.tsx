"use client";

import { useActionState, useState, type ReactNode } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import {
  LARGO_MAXIMO_SITUACION,
  OPCIONES_URGENCIA,
  ROLES_EN_SITUACION,
} from "@/app/profesor/situacion-opciones";
import type { OpcionesRegistro } from "../datos";
import { registrarHistorico } from "../historico/acciones";
import { LARGO_MAXIMO_CONCLUSION } from "../historico/opciones";
import { registrarSituacion, type EstadoRegistro } from "./acciones";
import { ORIGENES } from "./opciones";

const estadoInicial: EstadoRegistro = {};

// Mismo aspecto que Campo (components/formulario.tsx), para select y textarea.
const claseControl =
  "block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15";

function borde(error?: string) {
  return error ? "border-destructive" : "border-input";
}

// PB-043 (HU-036): formulario de Convivencia. La API vuelve a validar cada
// dato; aquí solo se muestran sus mensajes junto al campo correspondiente.
// PB-075 (HU-065): con historico registra una situación de un año anterior,
// sin urgencia ni curso y con la conclusión con que queda como antecedente.
export function FormularioRegistro({
  opciones,
  historico = false,
}: {
  opciones: OpcionesRegistro;
  historico?: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    historico ? registrarHistorico : registrarSituacion,
    estadoInicial,
  );
  const valores = estado.valores ?? {};
  const errores = estado.errores ?? {};
  const [origen, setOrigen] = useState(valores.tipo_origen ?? "");
  const urgencia = valores.urgencia || "NORMAL";
  
  // PB-076 (HU-066): quienes hoy no tienen matrícula activa van en un grupo
  // aparte; la API guarda la matrícula que tenían el día del hecho.
  const grupos =
    opciones.sin_matricula.length > 0
      ? [
          ...opciones.cursos,
          {
            id: "sin-matricula",
            nombre: "Sin matrícula activa",
            estudiantes: opciones.sin_matricula,
          },
        ]
      : opciones.cursos;

  // CA1: la lista de informantes depende de quién informó.
  const informantes =
    origen === "ESTUDIANTE"
      ? opciones.cursos.flatMap((curso) =>
          curso.estudiantes.map((e) => ({
            persona_id: e.persona_id,
            nombre: `${e.apellidos}, ${e.nombres} (${curso.nombre})`,
          })),
        )
      : origen === "FUNCIONARIO"
        ? opciones.funcionarios
        : origen === "APODERADO"
          ? opciones.apoderados
          : [];

  return (
    <form action={accion} noValidate className="max-w-3xl space-y-6">
      {estado.mensaje && !estado.errores && (
        <AvisoError>{estado.mensaje}</AvisoError>
      )}

      <Bloque titulo="Quién informó">
        <fieldset
          aria-describedby={errores.tipo_origen ? "tipo_origen-error" : undefined}
        >
          <legend className="text-sm font-medium">Origen</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ORIGENES.map((opcion) => (
              <label
                key={opcion.valor}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
              >
                <input
                  type="radio"
                  name="tipo_origen"
                  value={opcion.valor}
                  checked={origen === opcion.valor}
                  onChange={() => setOrigen(opcion.valor)}
                  className="accent-primary"
                />
                {opcion.texto}
              </label>
            ))}
          </div>
          <Mensaje id="tipo_origen" error={errores.tipo_origen} />
        </fieldset>

        {origen && origen !== "OTRO" && (
          <div>
            <label
              htmlFor="informante_persona_id"
              className="block text-sm font-medium"
            >
              Persona que informó (opcional)
            </label>
            <select
              id="informante_persona_id"
              name="informante_persona_id"
              key={origen}
              defaultValue={
                origen === valores.tipo_origen
                  ? (valores.informante_persona_id ?? "")
                  : ""
              }
              aria-invalid={errores.informante_persona_id ? true : undefined}
              aria-describedby={
                errores.informante_persona_id
                  ? "informante_persona_id-error"
                  : "informante_persona_id-ayuda"
              }
              className={`mt-1.5 ${claseControl} ${borde(errores.informante_persona_id)}`}
            >
              <option value="">Sin indicar</option>
              {informantes.map((persona) => (
                <option key={persona.persona_id} value={persona.persona_id}>
                  {persona.nombre}
                </option>
              ))}
            </select>
            <Mensaje
              id="informante_persona_id"
              error={errores.informante_persona_id}
              ayuda={
                informantes.length === 0
                  ? "Todavía no hay personas registradas con este origen; puedes dejarlo sin indicar."
                  : "Quedará guardado aparte de quien registra la situación."
              }
            />
          </div>
        )}
      </Bloque>

      <Bloque titulo="Qué ocurrió">
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            name="ocurrido_en"
            etiqueta="Fecha y hora del hecho"
            type="datetime-local"
            required
            defaultValue={valores.ocurrido_en}
            error={errores.ocurrido_en}
            ayuda={
              historico
                ? "Puede ser de un año anterior, y el curso de cada estudiante se toma de su matrícula de ese día."
                : undefined
            }
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

        <div className="grid gap-5 sm:grid-cols-2">
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
              <option value="">Sin categoría</option>
              {opciones.categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
            <Mensaje id="categoria_id" error={errores.categoria_id} />
          </div>
          {!historico && (
            <div>
              <label htmlFor="curso_id" className="block text-sm font-medium">
                Curso del hecho (opcional)
              </label>
              <select
                id="curso_id"
                name="curso_id"
                defaultValue={valores.curso_id ?? ""}
                aria-invalid={errores.curso_id ? true : undefined}
                aria-describedby={errores.curso_id ? "curso_id-error" : undefined}
                className={`mt-1.5 ${claseControl} ${borde(errores.curso_id)}`}
              >
                <option value="">Sin curso o varios cursos</option>
                {opciones.cursos.map((curso) => (
                  <option key={curso.id} value={curso.id}>
                    {curso.nombre}
                  </option>
                ))}
              </select>
              <Mensaje id="curso_id" error={errores.curso_id} />
            </div>
          )}
        </div>

        {!historico && (
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
        )}

        <div>
          <label htmlFor="descripcion" className="block text-sm font-medium">
            Descripción
          </label>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={6}
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
            ayuda="Cuenta lo que informaron, como lo informaron. Una vez enviada no se puede editar."
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
            ayuda="Abre cada curso y elige el rol de los estudiantes que participaron; pueden ser de cursos distintos. Los retirados o egresados están en «Sin matrícula activa». Los demás quedan como «No participa»."
          />
          <div
            className={`mt-3 divide-y divide-border rounded-xl border ${
              errores.participantes ? "border-destructive" : "border-border"
            }`}
          >
            {grupos.map((curso) => (
              <details
                key={curso.id}
                // Al volver con errores, los cursos con estudiantes elegidos quedan abiertos.
                open={curso.estudiantes.some((e) => valores[`rol:${e.id}`])}
                className="group"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium hover:bg-muted">
                  {curso.nombre}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {curso.estudiantes.length}{" "}
                    {curso.estudiantes.length === 1 ? "estudiante" : "estudiantes"}
                  </span>
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {curso.estudiantes.map((estudiante) => {
                    const campo = `rol:${estudiante.id}`;
                    return (
                      <li
                        key={estudiante.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <label htmlFor={campo} className="text-sm">
                          {estudiante.apellidos}, {estudiante.nombres}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
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
              </details>
            ))}
          </div>
          <Mensaje id="participantes" error={errores.participantes} />
        </fieldset>
      </Bloque>

      {historico && (
        <Bloque titulo="Cómo terminó">
          <div>
            <label htmlFor="conclusion" className="block text-sm font-medium">
              Conclusión
            </label>
            <textarea
              id="conclusion"
              name="conclusion"
              rows={4}
              maxLength={LARGO_MAXIMO_CONCLUSION}
              defaultValue={valores.conclusion}
              aria-invalid={errores.conclusion ? true : undefined}
              aria-describedby={
                errores.conclusion ? "conclusion-error" : "conclusion-ayuda"
              }
              className={`mt-1.5 ${claseControl} ${borde(errores.conclusion)}`}
            />
            <Mensaje
              id="conclusion"
              error={errores.conclusion}
              ayuda="La situación queda como antecedente con esta conclusión y después no se puede editar."
            />
          </div>
        </Bloque>
      )}

      <BotonEnviar
        pendiente={pendiente}
        textoPendiente={historico ? "Guardando…" : "Registrando…"}
      >
        {historico ? "Guardar registro histórico" : "Registrar situación"}
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