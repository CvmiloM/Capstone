import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { NOMBRE_ESTADO_ESTUDIANTE } from "@/app/admin/estudiantes/opciones";
import {
  claseBotonSecundario,
  claseEnlace,
  Encabezado,
} from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { obtenerEstudiantes } from "./datos";

export const metadata: Metadata = { title: "Historial de estudiantes" };

const claseControl =
  "mt-1.5 block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring focus:ring-3 focus:ring-ring/15";

function leer(valor: string | string[] | undefined) {
  return typeof valor === "string" ? valor.trim() : "";
}

function registros(situaciones: number, casos: number) {
  if (situaciones === 0 && casos === 0) return null;
  return [
    situaciones === 1 ? "1 situación" : `${situaciones} situaciones`,
    casos === 1 ? "1 caso" : `${casos} casos`,
  ].join(" · ");
}

// PB-074 (HU-064): para llegar al historial se busca al estudiante por
// nombre, código o RUT (?buscar=, ?pagina=). Aparecen también los que hoy no
// tienen matrícula, como retirados o egresados, porque su historial se conserva.
export default async function PaginaEstudiantesConvivencia({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string | string[]; pagina?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const buscar = leer(parametros.buscar);
  const pagina = Math.max(1, Number.parseInt(leer(parametros.pagina), 10) || 1);

  const respuesta = await obtenerEstudiantes({ buscar, pagina });
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const lista = respuesta.datos;

  const totalPaginas = Math.max(1, Math.ceil(lista.total / lista.por_pagina));
  const desde = (lista.pagina - 1) * lista.por_pagina + 1;
  const hasta = desde + lista.estudiantes.length - 1;

  function enlacePagina(numero: number) {
    const consulta = new URLSearchParams();
    if (buscar) consulta.set("buscar", buscar);
    if (numero > 1) consulta.set("pagina", String(numero));
    const texto = consulta.toString();
    return texto ? `/convivencia/estudiantes?${texto}` : "/convivencia/estudiantes";
  }

  return (
    <>
      <Encabezado
        titulo="Historial de estudiantes"
        descripcion="Busca a un estudiante para ver en orden sus situaciones y casos, con la fecha, el autor y los respaldos de cada uno."
      />

      <Form
        action="/convivencia/estudiantes"
        role="search"
        className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-tarjeta sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div>
          <label htmlFor="buscar" className="block text-sm font-medium">
            Buscar
          </label>
          <input
            id="buscar"
            name="buscar"
            type="search"
            defaultValue={buscar}
            maxLength={100}
            placeholder="Nombre, código o RUT"
            className={claseControl}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={claseBotonSecundario}>
            Buscar
          </button>
          {buscar && (
            <Link
              href="/convivencia/estudiantes"
              className={`self-center text-sm ${claseEnlace}`}
            >
              Limpiar
            </Link>
          )}
        </div>
      </Form>

      {lista.estudiantes.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {buscar
            ? "No encontramos estudiantes con esa búsqueda."
            : "Tu escuela todavía no tiene estudiantes."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Estudiantes de la escuela</caption>
              <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Estudiante
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Curso actual
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Registros
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.estudiantes.map((estudiante) => (
                  <tr key={estudiante.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/convivencia/estudiantes/${estudiante.id}`}
                        className={`font-medium ${claseEnlace}`}
                      >
                        {estudiante.apellidos}, {estudiante.nombres}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {estudiante.codigo_estudiante}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {estudiante.curso_actual ?? (
                        <span className="text-muted-foreground">
                          Sin matrícula activa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {NOMBRE_ESTADO_ESTUDIANTE[estudiante.estado] ??
                        estudiante.estado}
                    </td>
                    <td className="px-4 py-3">
                      {registros(estudiante.situaciones, estudiante.casos) ?? (
                        <span className="text-muted-foreground">Sin registros</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Páginas de estudiantes"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
          >
            <p>
              {desde}–{hasta} de {lista.total}{" "}
              {lista.total === 1 ? "estudiante" : "estudiantes"}
            </p>
            {totalPaginas > 1 && (
              <div className="flex gap-2">
                {lista.pagina > 1 && (
                  <Link
                    href={enlacePagina(lista.pagina - 1)}
                    className={claseBotonSecundario}
                  >
                    Anterior
                  </Link>
                )}
                {lista.pagina < totalPaginas && (
                  <Link
                    href={enlacePagina(lista.pagina + 1)}
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