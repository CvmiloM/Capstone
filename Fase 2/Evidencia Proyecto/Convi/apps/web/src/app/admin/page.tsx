import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { Icono, type NombreIcono } from "@/app/components/icono";
import { obtenerContextoAdmin, obtenerResumen } from "./datos";

export const metadata: Metadata = { title: "Resumen" };

type Cifra = {
  titulo: string;
  /** null cuando la cifra no se puede calcular, por ejemplo sin año activo. */
  valor: number | null;
  /** Qué cuenta exactamente la cifra (HU-033 CA2 y CA3). */
  detalle: ReactNode;
  icono: NombreIcono;
};

const formatoNumero = new Intl.NumberFormat("es-CL");

// HU-033: resumen de la escuela para el administrador.
export default async function PaginaResumen() {
  const [resumen, { escuela }] = await Promise.all([
    obtenerResumen(),
    obtenerContextoAdmin(),
  ]);
  const { anioActivo, profesores, convivencia } = resumen;

  // CA2: sin año activo no se inventa uno; se explica qué falta.
  const sinAnioActivo = (
    <>
      No hay un año académico activo.{" "}
      <Link href="/admin/anios" className={claseEnlace}>
        Revisar años
      </Link>
    </>
  );

  const cifras: Cifra[] = [
    {
      titulo: "Cuentas habilitadas",
      valor: resumen.cuentasActivas,
      detalle: "Cuentas en estado Activo, de todos los perfiles. No indica quién está conectado.",
      icono: "usuarios",
    },
    {
      titulo: "Profesores",
      valor: profesores.registrados,
      detalle: `${formatoNumero.format(profesores.activos)} con la cuenta activa.`,
      icono: "cursos",
    },
    {
      titulo: "Equipo de Convivencia",
      valor: convivencia.registrados,
      detalle: `${formatoNumero.format(convivencia.activos)} con la cuenta activa.`,
      icono: "escudo",
    },
    {
      titulo: "Cursos",
      valor: anioActivo?.cursos ?? null,
      detalle: anioActivo ? `Del año académico ${anioActivo.anio}.` : sinAnioActivo,
      icono: "niveles",
    },
    {
      titulo: "Estudiantes matriculados",
      valor: anioActivo?.matriculas ?? null,
      detalle: anioActivo
        ? `Matrículas vigentes del año ${anioActivo.anio}.`
        : sinAnioActivo,
      icono: "estudiantes",
    },
    {
      titulo: "Accesos de apoderados",
      valor: resumen.accesosApoderado,
      detalle: "Accesos activos y no vencidos. Cada apoderado cuenta una vez por estudiante.",
      icono: "apoderados",
    },
    {
      titulo: "Protocolos vigentes",
      valor: resumen.protocolosVigentes,
      detalle: "Versiones publicadas que están dentro de su vigencia.",
      icono: "protocolos",
    },
    {
      titulo: "Reglas activas",
      valor: resumen.reglasActivas,
      detalle: "Reglas guardadas en estado Activo. No son alertas generadas.",
      icono: "reglas",
    },
  ];

  // Las fechas se muestran en la zona horaria de la escuela (HU-021).
  const calculadoEn = new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: escuela.zonaHoraria,
  }).format(new Date(resumen.calculadoEn));

  return (
    <>
      <Encabezado
        titulo="Resumen de la escuela"
        descripcion={`Lo que está configurado en ${escuela.nombre}. Cifras actualizadas el ${calculadoEn} h.`}
      />

      {resumen.origen === "ejemplo" && (
        <div
          role="note"
          className="mb-6 flex gap-2.5 rounded-lg border border-primary/15 bg-accent px-4 py-3 text-sm text-accent-foreground"
        >
          <Icono nombre="info" className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-semibold">Cifras de ejemplo.</strong> Esta
            pantalla todavía no está conectada con el backend.
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cifras.map((cifra) => (
          <TarjetaCifra key={cifra.titulo} {...cifra} />
        ))}
      </ul>

      <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
        <Icono nombre="candado" className="mt-px size-3.5 shrink-0" />
        Este resumen no incluye situaciones, casos ni alertas: el perfil
        Administrador no accede a los expedientes de convivencia.
      </p>
    </>
  );
}

function TarjetaCifra({ titulo, valor, detalle, icono }: Cifra) {
  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icono nombre={icono} className="size-4 text-primary" />
        {titulo}
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">
        {valor === null ? "—" : formatoNumero.format(valor)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>
    </li>
  );
}