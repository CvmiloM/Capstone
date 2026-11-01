import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { obtenerOpcionesRegistro } from "../datos";
import { FormularioRegistro } from "./formulario-registro";

export const metadata: Metadata = { title: "Registrar situación" };

// PB-043 (HU-036): Convivencia registra una situación que llegó por otro canal
// (un estudiante, un apoderado, un funcionario u otro). Llega Nueva a la
// bandeja con su código, igual que las que registran los profesores.
export default async function PaginaRegistrar() {
  const respuesta = await obtenerOpcionesRegistro();
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;

  return (
    <>
      <Link href="/convivencia" className={`text-sm ${claseEnlace}`}>
        ← Bandeja de situaciones
      </Link>
      <div className="mt-4">
        <Encabezado
          titulo="Registrar situación"
          descripcion="Para situaciones informadas por estudiantes, apoderados, funcionarios u otras personas. Quedará registrada a tu nombre y llegará Nueva a la bandeja."
        />
      </div>
      {respuesta.datos.cursos.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Todavía no hay estudiantes con matrícula activa en la escuela, así que
          no se puede registrar una situación.
        </p>
      ) : (
        <FormularioRegistro opciones={respuesta.datos} />
      )}
    </>
  );
}
