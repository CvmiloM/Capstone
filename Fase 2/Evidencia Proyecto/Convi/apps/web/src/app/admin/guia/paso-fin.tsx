import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { claseEnlace } from "@/app/components/formulario";
import { NOMBRE_ESTADO as NOMBRE_ESTADO_ANIO } from "../anios/datos";
import { BotonTerminarGuia } from "./boton-terminar";
import { obtenerResumenGuia, type Guia, type ResumenGuia } from "./datos";
import {
  CLASE_ESTADO_PASO,
  METODOS_REGISTRO,
  NOMBRE_ESTADO_PASO,
  PASOS,
  type ClavePaso,
} from "./opciones";

const formatoNumero = new Intl.NumberFormat("es-CL");

function cuenta(cantidad: number, uno: string, varios: string) {
  return `${formatoNumero.format(cantidad)} ${cantidad === 1 ? uno : varios}`;
}

type Detalle = { guardado: string[]; falta: string[] };

/**
 * HU-032 CA1: lo guardado y lo que falta en cada paso, con las cifras reales.
 * Separa las cuentas activas de las invitaciones que esperan aceptación y las
 * versiones del reglamento cargadas de las publicadas y de su preparación.
 */
function detalles(
  guia: Guia,
  r: ResumenGuia,
): Record<Exclude<ClavePaso, "fin">, Detalle> {
  const metodo = METODOS_REGISTRO.find(
    (m) => m.valor === guia.metodo_registro_actual,
  )?.texto;
  const { CONVIVENCIA: convivencia, PROFESOR: profesores } = r.equipo;
  const porAceptar = convivencia.pendientes + profesores.pendientes;
  const equipo = porAceptar + convivencia.activas + profesores.activas;
  const cuentas = (c: { pendientes: number; activas: number }) =>
    `${cuenta(c.activas, "cuenta activa", "cuentas activas")} y ${cuenta(c.pendientes, "invitación por aceptar", "invitaciones por aceptar")}`;
  const rice = r.reglamento;
  const reglas = r.reglas.activas + r.reglas.borradores;

  return {
    bienvenida: {
      guardado: [
        metodo
          ? `Antes de CONVI la escuela usaba: ${metodo}.`
          : "Sin respuesta, es opcional.",
      ],
      falta: [],
    },
    equipo: {
      guardado: [
        `Convivencia: ${cuentas(convivencia)}.`,
        `Profesores: ${cuentas(profesores)}.`,
      ],
      falta: [
        ...(equipo === 0
          ? ["Invitar al equipo de Convivencia y a los profesores."]
          : []),
        ...(porAceptar > 0
          ? [
              `${porAceptar === 1 ? "1 invitación enviada espera que la persona la acepte" : `${formatoNumero.format(porAceptar)} invitaciones enviadas esperan que las personas las acepten`}; se pueden reenviar desde Usuarios.`,
            ]
          : []),
      ],
    },
    cursos: {
      guardado: [
        r.anio
          ? `Año ${r.anio.anio} (${NOMBRE_ESTADO_ANIO[r.anio.estado as keyof typeof NOMBRE_ESTADO_ANIO] ?? r.anio.estado}) con ${cuenta(r.anio.cursos, "curso", "cursos")}.`
          : "Sin un año académico activo ni planificado.",
        `${cuenta(r.niveles_activos, "nivel activo", "niveles activos")}.`,
      ],
      falta: [
        ...(!r.anio ? ["Crear el año académico y sus cursos."] : []),
        ...(r.anio && r.anio.cursos === 0 ? ["Crear los cursos del año."] : []),
        ...(r.anio?.estado === "PLANIFICADO"
          ? ["Activar el año en Años académicos cuando empiece."]
          : []),
      ],
    },
    reglamento: {
      guardado:
        rice.cargadas === 0
          ? ["Sin reglamento cargado."]
          : [
              `${cuenta(rice.cargadas, "versión cargada", "versiones cargadas")}, ${cuenta(rice.publicadas_vigentes, "publicada y vigente", "publicadas y vigentes")}.`,
              `Preparación para las consultas con IA: ${cuenta(rice.lista, "lista", "listas")}, ${formatoNumero.format(rice.en_proceso)} en proceso y ${cuenta(rice.fallida, "fallida", "fallidas")}.`,
            ],
      falta: [
        ...(rice.cargadas === 0 ? ["Subir el reglamento interno (RICE)."] : []),
        ...(rice.cargadas > 0 && rice.publicadas_vigentes === 0
          ? [
              "Publicar una versión en Documentos: solo una versión publicada y vigente se usa en las consultas con IA.",
            ]
          : []),
        ...(rice.fallida > 0
          ? ["Revisar en Documentos la preparación que falló y volver a pedirla."]
          : []),
      ],
    },
    estudiantes: {
      guardado: [
        `${cuenta(r.estudiantes_confirmados, "estudiante confirmado", "estudiantes confirmados")} en la importación de la nómina.`,
      ],
      falta:
        r.estudiantes_confirmados === 0
          ? ["Importar la nómina de estudiantes."]
          : [],
    },
    reglas: {
      guardado: [
        `${cuenta(r.categorias_activas, "categoría activa", "categorías activas")}.`,
        `${cuenta(r.reglas.activas, "regla activa", "reglas activas")} y ${formatoNumero.format(r.reglas.borradores)} en borrador.`,
      ],
      falta: [
        ...(reglas === 0 ? ["Crear una regla de aviso."] : []),
        ...(r.reglas.activas === 0 && r.reglas.borradores > 0
          ? ["Activar una regla en Reglas: un borrador no avisa."]
          : []),
      ],
    },
  };
}

// PB-039 (HU-032): resumen de la guía con las cifras reales de la escuela y,
// mientras la guía no termina, el botón para terminarla aunque falten pasos.
// Con la guía terminada se muestra solo para leer (CA3).
export async function PasoFin({
  guia,
  fecha,
  terminada = false,
}: {
  guia: Guia;
  fecha: (iso: string) => string;
  terminada?: boolean;
}) {
  const resumen = await obtenerResumenGuia();
  const porPaso = detalles(guia, resumen);
  const pasos = PASOS.filter(
    (p): p is (typeof PASOS)[number] & { clave: Exclude<ClavePaso, "fin"> } =>
      p.clave !== "fin",
  );
  const sinListo = pasos.filter(
    (p) => guia.pasos.find((x) => x.clave === p.clave)?.estado !== "LISTO",
  ).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cifras de tu escuela al {fecha(resumen.calculado_en)}.
      </p>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {pasos.map((p) => {
          const estado = guia.pasos.find((x) => x.clave === p.clave)!.estado;
          const { guardado, falta } = porPaso[p.clave];
          return (
            <li key={p.clave} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{p.titulo}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${CLASE_ESTADO_PASO[estado]}`}
                >
                  {NOMBRE_ESTADO_PASO[estado]}
                </span>
              </div>
              <ul className="space-y-0.5">
                {guardado.map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
              {falta.length > 0 && (
                <div className="rounded-lg bg-amarillo/15 px-3 py-2 text-tinta">
                  <p className="font-medium">Falta</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {falta.map((texto) => (
                      <li key={texto}>{texto}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!terminada && estado !== "LISTO" && (
                <Link
                  href={`/admin/guia?paso=${p.clave}`}
                  className={`inline-block ${claseEnlace}`}
                >
                  Ir al paso {p.titulo}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {!terminada && (
        <section className="border-t border-border pt-5">
          <p className="mb-3 text-sm text-muted-foreground">
            {sinListo === 0
              ? "Todos los pasos están listos."
              : `${sinListo === 1 ? "Queda 1 paso" : `Quedan ${sinListo} pasos`} sin marcar como listo. Puedes terminar igual: lo que falta se sigue haciendo desde el portal.`}{" "}
            Al terminar se guarda la fecha y se abre el portal de
            administración.
          </p>
          <BotonTerminarGuia version={guia.version} />
        </section>
      )}
    </div>
  );
}
