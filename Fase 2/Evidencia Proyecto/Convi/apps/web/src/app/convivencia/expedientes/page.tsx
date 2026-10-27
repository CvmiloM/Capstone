import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  AvisoError,
  claseBotonSecundario,
  claseEnlace,
  Encabezado,
} from "@/app/components/formulario";
// Mismos estilos de urgencia y formato de fecha que el resto del portal.
import { obtenerFormatoFecha, URGENCIA } from "@/app/profesor/datos";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { formatearDia, nombreEstado, OPCIONES_ESTADO } from "../estudiantes/datos";
import {
  direccionBusqueda,
  LARGO_MAXIMO_CODIGO,
  LARGO_MAXIMO_ESTUDIANTE,
  leerFiltroExpedientes,
  obtenerExpedientes,
  type ExpedienteEncontrado,
  type ResultadoBusqueda,
} from "./datos";

export const metadata: Metadata = { title: "Buscar expedientes" };

const claseControl =
  "mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15";

/** Estudiantes que se nombran en cada resultado antes de resumir el resto. */
const NOMBRES_VISIBLES = 3;

function total(
  conteo: ResultadoBusqueda["conteo"],
  { tipo, estado }: { tipo?: string; estado?: string },
) {
  return conteo
    .filter((f) => (!tipo || f.tipo === tipo) && (!estado || f.estado === estado))
    .reduce((suma, f) => suma + f.total, 0);
}

type Parametros = {
  codigo?: string | string[];
  estudiante?: string | string[];
  estado?: string | string[];
  desde?: string | string[];
  hasta?: string | string[];
  pagina?: string | string[];
};

// PB-077 (HU-067): situaciones y casos de la escuela en una sola lista, del
// más reciente al más antiguo. Cada filtro (código, estudiante, estado y
// período) reduce el resultado y cada expediente abre su detalle (CA1). La API
// solo busca en la escuela de la sesión (CA2). El estado incluye todos los de
// situaciones y casos, y cada caso muestra todos sus cursos históricos (CA3).
export default async function PaginaBuscarExpedientes({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const { filtro, errores } = leerFiltroExpedientes(parametros);
  const respuesta = await obtenerExpedientes(filtro);
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const { resultados, conteo, pagina, por_pagina } = respuesta.datos;

  const filtrando =
    filtro.codigo !== "" ||
    filtro.estudiante !== "" ||
    filtro.estado !== "" ||
    filtro.desde !== "" ||
    filtro.hasta !== "";
  const conError = Object.keys(errores).length > 0;
  const totalPaginas = Math.max(1, Math.ceil(respuesta.datos.total / por_pagina));
  const primero = (pagina - 1) * por_pagina + 1;
  const ultimo = primero + resultados.length - 1;
  // Lo que escribió la persona, para dejarlo en el campo aunque tenga un error.
  const texto = (campo: keyof Parametros) => {
    const valor = parametros[campo];
    return typeof valor === "string" ? valor : "";
  };

  return (
    <>
      <Encabezado
        titulo="Buscar expedientes"
        descripcion="Encuentra situaciones y casos de tu escuela por código, estudiante, estado o período, y abre el que necesites."
      />

      <Form
        action="/convivencia/expedientes"
        role="search"
        aria-label="Buscar expedientes"
        className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-tarjeta md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1.4fr_1fr_1fr_auto] xl:items-start"
      >
        <Campo
          nombre="codigo"
          etiqueta="Código"
          error={errores.codigo}
          valor={texto("codigo")}
          largo={LARGO_MAXIMO_CODIGO}
          ejemplo="SIT-2026-00012"
        />
        <Campo
          nombre="estudiante"
          etiqueta="Estudiante"
          error={errores.estudiante}
          valor={texto("estudiante")}
          largo={LARGO_MAXIMO_ESTUDIANTE}
          ejemplo="Nombre, código o RUT"
        />
        <div>
          <label htmlFor="estado" className="block text-sm font-medium">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={filtro.estado}
            aria-invalid={errores.estado ? true : undefined}
            className={`${claseControl} ${errores.estado ? "border-destructive" : "border-input"}`}
          >
            <option value="">Situaciones y casos ({total(conteo, {})})</option>
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
        <CampoFecha nombre="desde" etiqueta="Desde" valor={texto("desde")} error={errores.desde} />
        <CampoFecha nombre="hasta" etiqueta="Hasta" valor={texto("hasta")} error={errores.hasta} />
        <div className="flex gap-2 xl:mt-7">
          <button type="submit" className={claseBotonSecundario}>
            Buscar
          </button>
          {(filtrando || conError) && (
            <Link href="/convivencia/expedientes" className={`self-center text-sm ${claseEnlace}`}>
              Limpiar
            </Link>
          )}
        </div>
      </Form>

      {conError && (
        <div className="mb-4">
          <AvisoError>
            Revisa los filtros marcados, mientras tanto se muestran los resultados sin ellos.
          </AvisoError>
        </div>
      )}

      {resultados.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {filtrando
            ? "No encontramos situaciones ni casos con estos filtros."
            : pagina > 1
              ? "No hay más expedientes."
              : "Tu escuela todavía no tiene situaciones ni casos."}
        </p>
      ) : (
        <>
          <ol aria-label="Expedientes encontrados" className="space-y-3">
            {resultados.map((expediente) => (
              <li key={`${expediente.tipo}-${expediente.id}`}>
                <Expediente expediente={expediente} />
              </li>
            ))}
          </ol>

          <nav
            aria-label="Páginas de expedientes"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
          >
            <p>
              {primero}–{ultimo} de {respuesta.datos.total}{" "}
              {respuesta.datos.total === 1 ? "expediente" : "expedientes"}
            </p>
            {totalPaginas > 1 && (
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Link
                    href={`/convivencia/expedientes${direccionBusqueda({ ...filtro, pagina: pagina - 1 })}`}
                    className={claseBotonSecundario}
                  >
                    Anterior
                  </Link>
                )}
                {pagina < totalPaginas && (
                  <Link
                    href={`/convivencia/expedientes${direccionBusqueda({ ...filtro, pagina: pagina + 1 })}`}
                    className={claseBotonSecundario}
                  >
                    Siguiente
                  </Link>
                )}
              </div>
            )}
          </nav>
        </>
      )}
    </>
  );
}

function Campo({
  nombre,
  etiqueta,
  valor,
  error,
  largo,
  ejemplo,
}: {
  nombre: string;
  etiqueta: string;
  valor: string;
  error?: string;
  largo: number;
  ejemplo: string;
}) {
  return (
    <div>
      <label htmlFor={nombre} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={nombre}
        name={nombre}
        type="search"
        defaultValue={valor}
        maxLength={largo}
        placeholder={ejemplo}
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

function CampoFecha({
  nombre,
  etiqueta,
  valor,
  error,
}: {
  nombre: string;
  etiqueta: string;
  valor: string;
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
        defaultValue={valor}
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

function nombres(estudiantes: string[]) {
  if (estudiantes.length === 0) return "Sin estudiantes";
  const visibles = estudiantes.slice(0, NOMBRES_VISIBLES).join(", ");
  const resto = estudiantes.length - NOMBRES_VISIBLES;
  return resto > 0 ? `${visibles} y ${resto === 1 ? "1 más" : `${resto} más`}` : visibles;
}

// Toda la tarjeta abre el detalle de la situación o del caso (CA1).
async function Expediente({ expediente }: { expediente: ExpedienteEncontrado }) {
  const formatearFecha = await obtenerFormatoFecha();
  const esCaso = expediente.tipo === "CASO";
  const urgencia =
    expediente.tipo === "SITUACION" ? (URGENCIA[expediente.urgencia] ?? URGENCIA.NORMAL) : null;
  const detalle = esCaso
    ? `/convivencia/casos/${expediente.id}`
    : `/convivencia/situaciones/${expediente.id}`;
  return (
    <Link
      href={detalle}
      className="block rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            esCaso ? "bg-tinta text-crema" : "bg-accent text-accent-foreground"
          }`}
        >
          {esCaso ? "Caso" : "Situación"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{expediente.codigo}</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {nombreEstado(expediente)}
        </span>
        {urgencia && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencia.clase}`}>
            {urgencia.texto}
          </span>
        )}
        {/* HU-065: registros de años anteriores incorporados a mano. */}
        {expediente.registro_historico && (
          <span className="rounded-full bg-amarillo/25 px-2.5 py-0.5 text-xs font-medium text-tinta">
            Registro histórico
          </span>
        )}
      </div>

      <h2 className="mt-2 text-base font-semibold">
        {expediente.tipo === "CASO"
          ? expediente.titulo
          : (expediente.categoria ?? "Situación sin categoría")}
      </h2>

      <p className="mt-1 text-sm text-muted-foreground">
        {(expediente.tipo === "CASO"
          ? [
              expediente.categoria,
              `Inicio ${formatearDia(expediente.fecha_dia)}`,
              `Responsable: ${expediente.responsable}`,
              expediente.situaciones === 1
                ? "1 situación"
                : `${expediente.situaciones} situaciones`,
              expediente.cerrado_en && `Cerrado el ${formatearFecha(expediente.cerrado_en)}`,
            ]
          : [
              `Ocurrió el ${formatearFecha(expediente.fecha_hecho)}`,
              `Registrada el ${formatearFecha(expediente.fecha_registro)}`,
              expediente.caso && `En el caso ${expediente.caso.codigo}`,
            ]
        )
          .filter(Boolean)
          .join(" · ")}
      </p>

      <p className="mt-1 text-sm">{nombres(expediente.estudiantes)}</p>

      {/* HU-066 y HU-067 CA3: el curso de cada estudiante ese día, todos si son varios. */}
      {(expediente.cursos.length > 0 || expediente.curso_sin_registro) && (
        <ul aria-label="Cursos al ocurrir" className="mt-3 flex flex-wrap gap-1.5">
          {expediente.cursos.map((curso) => (
            <li
              key={curso}
              className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {curso}
            </li>
          ))}
          {expediente.curso_sin_registro && (
            <li className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              Curso histórico no registrado
            </li>
          )}
        </ul>
      )}
    </Link>
  );
}