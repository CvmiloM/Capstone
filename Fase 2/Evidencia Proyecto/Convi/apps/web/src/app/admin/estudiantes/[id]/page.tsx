import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerAnios } from "../../anios/datos";
import { obtenerCursos } from "../../cursos/datos";
import { ANIOS_EDITABLES } from "../../cursos/opciones";
import { obtenerContextoAdmin } from "../../datos";
import { obtenerFicha } from "../datos";
import { FormularioCambio } from "../formulario-cambio";
import { FormularioEstudiante } from "../formulario-estudiante";
import {
  FormularioMatricula,
  type OpcionesMatricula,
} from "../formulario-matricula";
import {
  MOVIMIENTOS_MATRICULA,
  NOMBRE_ESTADO_ESTUDIANTE,
  NOMBRE_ESTADO_MATRICULA,
} from "../opciones";

export const metadata: Metadata = { title: "Ficha del estudiante" };

// Las fechas llegan como AAAA-MM-DD: se muestran en UTC para que la zona
// horaria del servidor no cambie el día.
const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatearFecha(fecha: string | null) {
  return fecha ? formatoFecha.format(new Date(`${fecha}T00:00:00Z`)) : "—";
}

// PB-017 y PB-018 (HU-014): ficha administrativa del estudiante. CA4: muestra
// su matrícula y sus datos de contacto, pero nada de convivencia. PB-022 y
// PB-031: con matrícula vigente, permite cambiarla (?cambio= confirma el
// movimiento recién guardado).
export default async function PaginaEstudiante({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cambio?: string }>;
}) {
  const [{ id }, { cambio }] = await Promise.all([params, searchParams]);
  const guardado = MOVIMIENTOS_MATRICULA.find((m) => m.tipo === cambio);
  const [ficha, anios, { escuela }] = await Promise.all([
    obtenerFicha(id),
    obtenerAnios(),
    obtenerContextoAdmin(),
  ]);

  if (!ficha) {
    return (
      <>
        <Link href="/admin/estudiantes" className={`text-sm ${claseEnlace}`}>
          ← Estudiantes
        </Link>
        <p className="mt-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No encontramos ese estudiante en tu escuela.
        </p>
      </>
    );
  }

  // Fecha de hoy en la zona horaria de la escuela, para los valores por defecto.
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: escuela.zonaHoraria,
  }).format(new Date());
  const vigente = ficha.matriculas.find((m) => m.estado === "ACTIVO");

  // Solo se matricula en cursos de años Planificados o Activos (decisión del
  // PO de PB-015), agrupados por año.
  const editables = anios.filter((a) => ANIOS_EDITABLES.includes(a.estado));
  const opciones: OpcionesMatricula = (
    await Promise.all(
      editables.map(async (a) => ({
        id: a.id,
        anio: a.anio,
        estado: a.estado,
        fecha_inicio: a.fecha_inicio,
        cursos: (await obtenerCursos(a.id))
          .filter((c) => !["CERRADO", "ARCHIVADO"].includes(c.estado))
          .map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
      })),
    )
  ).filter((grupo) => grupo.cursos.length > 0);
  // Hoy o, si el año Activo todavía no empieza, su primer día.
  const anioSugerido =
    editables.find((a) => a.estado === "ACTIVO") ?? editables[0];
  const fechaSugerida =
    anioSugerido?.fecha_inicio && hoy < anioSugerido.fecha_inicio
      ? anioSugerido.fecha_inicio
      : hoy;

  const nombreEstado = NOMBRE_ESTADO_ESTUDIANTE[ficha.estado] ?? ficha.estado;

  return (
    <>
      <Link href="/admin/estudiantes" className={`text-sm ${claseEnlace}`}>
        ← Estudiantes
      </Link>

      <div className="mt-4">
        <Encabezado
          titulo={`${ficha.nombres} ${ficha.apellidos}`}
          descripcion={`Código ${ficha.codigo_estudiante}${ficha.rut ? ` · RUT ${ficha.rut}` : ""} · ${nombreEstado}`}
        />
      </div>

      {guardado && (
        <p
          role="status"
          className="mb-6 rounded-lg border border-verde/30 bg-verde/10 px-3 py-2.5 text-sm"
        >
          {guardado.listo}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
            aria-labelledby="titulo-apoderados"
          >
            <h2 id="titulo-apoderados" className="text-lg font-semibold">
              Apoderados y contactos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registra quién representa al estudiante, su relación y las
              condiciones de contacto
            </p>
            <Link
              href={`/admin/estudiantes/${ficha.id}/apoderados`}
              className={`mt-3 inline-block text-sm ${claseEnlace}`}
            >
              Administrar vínculos →
            </Link>
          </section>
          <section aria-labelledby="titulo-matriculas">
            <h2 id="titulo-matriculas" className="mb-3 text-lg font-semibold">
              Matrículas
            </h2>
            {ficha.matriculas.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Todavía no tiene matrículas.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-tarjeta">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Matrículas de {ficha.nombres} {ficha.apellidos}
                  </caption>
                  <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Curso
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Desde
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Hasta
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ficha.matriculas.map((matricula) => (
                      <tr key={matricula.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/cursos/${matricula.curso_id}`}
                            className={`font-medium ${claseEnlace}`}
                          >
                            {matricula.curso_nombre}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Año {matricula.anio}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatearFecha(matricula.matriculado_en)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatearFecha(matricula.finalizado_en)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              matricula.estado === "ACTIVO"
                                ? "bg-accent text-accent-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {NOMBRE_ESTADO_MATRICULA[matricula.estado] ??
                              matricula.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            aria-labelledby="titulo-matricular"
            className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
          >
            <h2 id="titulo-matricular" className="mb-4 text-lg font-semibold">
              {ficha.estado === "ACTIVO" && vigente
                ? "Cambiar matrícula"
                : "Matricular"}
            </h2>
            {ficha.estado !== "ACTIVO" ? (
              <p className="text-sm text-muted-foreground">
                El estudiante está {nombreEstado.toLowerCase()}: no se puede
                matricular.
              </p>
            ) : vigente ? (
              <>
                <p className="mb-5 text-sm text-muted-foreground">
                  Está matriculado en {vigente.curso_nombre} ({vigente.anio})
                  desde el {formatearFecha(vigente.matriculado_en)}. Un
                  estudiante tiene una sola matrícula vigente: para cambiarla,
                  regístralo aquí y las anteriores se conservan.
                </p>
                <FormularioCambio
                  estudianteId={ficha.id}
                  vigente={vigente}
                  opciones={opciones}
                  hoy={hoy}
                />
              </>
            ) : opciones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay cursos en años planificados o activos.{" "}
                <Link href="/admin/cursos" className={claseEnlace}>
                  Ir a cursos
                </Link>
              </p>
            ) : (
              <FormularioMatricula
                estudianteId={ficha.id}
                opciones={opciones}
                fechaSugerida={fechaSugerida}
              />
            )}
          </section>
        </div>

        <section
          aria-labelledby="titulo-datos"
          className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
        >
          <h2 id="titulo-datos" className="mb-4 text-lg font-semibold">
            Datos del estudiante
          </h2>
          <FormularioEstudiante ficha={ficha} hoy={hoy} />
        </section>
      </div>
    </>
  );
}
