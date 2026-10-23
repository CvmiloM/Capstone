import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { NOMBRE_ESTADO_ESTUDIANTE } from "@/app/admin/estudiantes/opciones";
import {
  AvisoError,
  claseBotonSecundario,
  claseEnlace,
} from "@/app/components/formulario";
// Mismos estilos de urgencia, formato de fecha y nombres de rol que el resto del portal.
import { formatearFecha, URGENCIA } from "@/app/profesor/datos";
import { NOMBRE_ROL_EN_SITUACION } from "@/app/profesor/situacion-opciones";
import { AvisoNoDisponible } from "../../aviso-no-disponible";
import {
  formatearDia,
  formatearTamano,
  leerFiltroHistorial,
  nombreEstado,
  NOMBRE_TIPO_RESPALDO,
  obtenerHistorial,
  OPCIONES_ESTADO,
  type Historial,
  type RegistroHistorial,
} from "../datos";

export const metadata: Metadata = { title: "Historial del estudiante" };

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15";

function total(
  conteo: Historial["conteo"],
  { tipo, estado }: { tipo?: string; estado?: string },
) {
  return conteo
    .filter((f) => (!tipo || f.tipo === tipo) && (!estado || f.estado === estado))
    .reduce((suma, f) => suma + f.total, 0);
}

// PB-074 (HU-064): historial de un estudiante para Convivencia. Muestra en
// orden sus situaciones, incluidos los antecedentes sin caso, y los casos
// relacionados, activos y cerrados (CA1), cada uno con fecha del hecho, fecha
// de registro, autor, el curso que tenía ese día y sus respaldos (CA2), con
// filtros por período y estado (CA3). Un estudiante de otra escuela no se
// muestra (CA4).
export default async function PaginaHistorialEstudiante({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    estado?: string | string[];
    desde?: string | string[];
    hasta?: string | string[];
    orden?: string | string[];
  }>;
}) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);
  const { filtro, errores } = leerFiltroHistorial(parametros);
  const respuesta = await obtenerHistorial(id, filtro);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia/estudiantes" />;
  const { estudiante, registros, conteo, total_filtrado, limite } = respuesta.datos;

  const situaciones = total(conteo, { tipo: "SITUACION" });
  const casos = total(conteo, { tipo: "CASO" });
  const filtrando =
    filtro.estado !== "" || filtro.desde !== "" || filtro.hasta !== "" || filtro.orden === "asc";
  const conError = Object.keys(errores).length > 0;

  return (
    <>
      <Link href="/convivencia/estudiantes" className={`text-sm ${claseEnlace}`}>
        ← Historial de estudiantes
      </Link>

      <div className="mt-4 mb-6">
        <p className="font-mono text-sm text-muted-foreground">
          {estudiante.codigo_estudiante}
          {estudiante.rut && ` · RUT ${estudiante.rut}`}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {estudiante.nombres} {estudiante.apellidos}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {/* HU-066 CA2: el curso actual va aparte del curso de cada hecho. */}
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {estudiante.curso_actual
              ? `Curso actual: ${estudiante.curso_actual}`
              : "Sin matrícula activa hoy"}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {NOMBRE_ESTADO_ESTUDIANTE[estudiante.estado] ?? estudiante.estado}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {situaciones === 0 && casos === 0
            ? "No tiene situaciones ni casos registrados."
                        : `${situaciones === 1 ? "1 situación" : `${situaciones} situaciones`} y ${casos === 1 ? "1 caso" : `${casos} casos`} en su historial.`}
        </p>
        {/* PB-075: situaciones de años anteriores que faltan en el historial. */}
        <Link href="/convivencia/historico" className={`mt-2 inline-block text-sm ${claseEnlace}`}>
          Agregar un registro histórico
        </Link>
      </div>

      <Form
        action={`/convivencia/estudiantes/${estudiante.id}`}
        aria-label="Filtrar el historial"
        className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-start"
      >
        <div>
          <label htmlFor="estado" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={filtro.estado}
            className={`${claseControl} border-input`}
          >
            <option value="">Todo ({situaciones + casos})</option>
            {(["SITUACION", "CASO"] as const).map((grupo) => (
              <optgroup key={grupo} label={grupo === "SITUACION" ? "Situaciones" : "Casos"}>
                {OPCIONES_ESTADO.filter((o) => o.grupo === grupo).map((o) => {
                  const [, estado] = o.valor.split(":");
                  return (
                    <option key={o.valor} value={o.valor}>
                      {o.texto} ({total(conteo, { tipo: grupo, estado })})
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <CampoFecha nombre="desde" etiqueta="Desde" valor={parametros.desde} error={errores.desde} />
        <CampoFecha nombre="hasta" etiqueta="Hasta" valor={parametros.hasta} error={errores.hasta} />
        <div>
          <label htmlFor="orden" className="block text-sm font-medium">
            Orden
          </label>
          <select
            id="orden"
            name="orden"
            defaultValue={filtro.orden}
            className={`${claseControl} border-input`}
          >
            <option value="desc">Más recientes primero</option>
            <option value="asc">Más antiguos primero</option>
          </select>
        </div>
        <div className="flex gap-2 lg:mt-7">
          <button type="submit" className={claseBotonSecundario}>
            Filtrar
          </button>
          {(filtrando || conError) && (
            <Link
              href={`/convivencia/estudiantes/${estudiante.id}`}
              className={`self-center text-sm ${claseEnlace}`}
            >
              Limpiar
            </Link>
          )}
        </div>
      </Form>

      {conError && (
        <div className="mb-4">
          <AvisoError>
            Revisa el período marcado, mientras tanto se muestra el historial sin esas fechas.
          </AvisoError>
        </div>
      )}

      {registros.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {situaciones + casos === 0
            ? "Este estudiante no tiene situaciones ni casos registrados."
            : "No hay registros con estos filtros."}
        </p>
      ) : (
        <ol aria-label="Registros del historial" className="space-y-3">
          {registros.map((registro) => (
            <li key={`${registro.tipo}-${registro.id}`}>
              <Registro registro={registro} />
            </li>
          ))}
        </ol>
      )}
      {total_filtrado > registros.length && (
        <p className="mt-4 text-sm text-muted-foreground">
          Se muestran {registros.length} de {total_filtrado} registros, usa el período para ver el resto.
        </p>
      )}
      {total_filtrado <= registros.length && registros.length >= limite && (
        <p className="mt-4 text-sm text-muted-foreground">
          Se muestran los primeros {limite} registros.
        </p>
      )}
    </>
  );
}

function CampoFecha({
  nombre,
  etiqueta,
  valor,
  error,
}: {
  nombre: string;
  etiqueta: string;
  valor: string | string[] | undefined;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={nombre} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={nombre}
        name={nombre}
        type="date"
        defaultValue={typeof valor === "string" ? valor : ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${nombre}-error` : undefined}
        className={`${claseControl} ${error ? "border-destructive" : "border-input"}`}
      />
      {error && (
        <p id={`${nombre}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Registro({ registro }: { registro: RegistroHistorial }) {
  const esCaso = registro.tipo === "CASO";
  const urgencia =
    registro.tipo === "SITUACION" ? (URGENCIA[registro.urgencia] ?? URGENCIA.NORMAL) : null;
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            esCaso ? "bg-tinta text-crema" : "bg-accent text-accent-foreground"
          }`}
        >
          {esCaso ? "Caso" : "Situación"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{registro.codigo}</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {nombreEstado(registro)}
        </span>
        {urgencia && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencia.clase}`}>
            {urgencia.texto}
          </span>
        )}
        {/* HU-065: registros de años anteriores incorporados a mano. */}
        {registro.registro_historico && (
          <span className="rounded-full bg-amarillo/25 px-2.5 py-0.5 text-xs font-medium text-tinta">
            Registro histórico
          </span>
        )}
      </div>

      <h2 className="mt-2 text-base font-semibold">
        {registro.tipo === "CASO" ? registro.titulo : (registro.categoria ?? "Situación sin categoría")}
      </h2>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Dato nombre={esCaso ? "Inicio del caso" : "Ocurrió"}>
          {esCaso ? formatearDia(registro.fecha_dia) : formatearFecha(registro.fecha_hecho)}
        </Dato>
        <Dato nombre="Registrado">{formatearFecha(registro.fecha_registro)}</Dato>
        <Dato nombre={esCaso ? "Abrió el caso" : "Registró"}>
          {registro.autor}
          {registro.tipo === "SITUACION" &&
            (registro.perfil_autor === "PROFESOR" ? " (profesor)" : " (Convivencia)")}
        </Dato>
        {/* PB-076 (HU-066 CA2 y CA3): el curso de ese día, aunque hoy sea otro. */}
        <Dato nombre="Curso ese día">
          {registro.curso_al_ocurrir ?? (
            <span className="font-normal text-muted-foreground">Curso histórico no registrado</span>
          )}
        </Dato>
        {registro.tipo === "SITUACION" && (
          <Dato nombre="Participó como">
            {NOMBRE_ROL_EN_SITUACION[registro.rol] ?? registro.rol}
          </Dato>
        )}
        {registro.tipo === "SITUACION" && registro.caso && (
          <Dato nombre="Caso">{registro.caso}</Dato>
        )}
        {registro.tipo === "CASO" && registro.situaciones.length > 0 && (
          <Dato nombre="Situaciones vinculadas">{registro.situaciones.join(", ")}</Dato>
        )}
        {registro.tipo === "CASO" && registro.cerrado_en && (
          <Dato nombre="Cerrado">{formatearFecha(registro.cerrado_en)}</Dato>
        )}
      </dl>

      {/* HU-064 CA2: los respaldos autorizados del registro. */}
      <div className="mt-4 border-t border-border pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Respaldos
        </h3>
        {registro.respaldos.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">Sin respaldos.</p>
        ) : (
          <ul className="mt-1.5 space-y-2 text-sm">
            {registro.respaldos.map((r) => (
              <li key={r.id}>
                <p className="font-medium">
                  {r.titulo}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {NOMBRE_TIPO_RESPALDO[r.tipo] ?? r.tipo}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[
                    formatearFecha(r.fecha),
                    `Aportó ${r.aportado_por}`,
                    r.archivo &&
                      `${r.archivo}${r.tamano_bytes !== null ? ` (${formatearTamano(r.tamano_bytes)})` : ""}`,
                    r.corrige && "Corrige un respaldo anterior",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {registro.tipo === "SITUACION" && (
        <Link
          href={`/convivencia/situaciones/${registro.id}`}
          className={`mt-4 inline-block text-sm ${claseEnlace}`}
        >
          Abrir la situación
        </Link>
      )}
    </article>
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