import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { obtenerOpcionesRegistro } from "../datos";
import { FormularioRegistro } from "../registrar/formulario-registro";

export const metadata: Metadata = { title: "Registro histórico" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PB-075 (HU-065): Convivencia incorpora a mano situaciones de años
// anteriores, de a una (CA4). Se guardan con su fecha real, la fecha de
// registro la pone el servidor (CA2) y quedan marcadas como registro
// histórico y como antecedente con su conclusión (CA1). El curso de cada
// estudiante sale de su matrícula de ese día o queda como «Curso histórico no
// registrado» (CA3).
export default async function PaginaRegistroHistorico({
  searchParams,
}: {
  searchParams: Promise<{ guardada?: string | string[] }>;
}) {
  const { guardada } = await searchParams;
  const respuesta = await obtenerOpcionesRegistro();
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const situacionGuardada =
    typeof guardada === "string" && UUID.test(guardada) ? guardada : null;

  return (
    <>
      <Encabezado
        titulo="Registro histórico"
        descripcion="Para incorporar situaciones de años anteriores con su fecha real, quedan como antecedente con su conclusión y marcadas como registro histórico."
      />

      {situacionGuardada && (
        <div
          role="status"
          className="mb-6 max-w-3xl rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm"
        >
          Guardaste la situación como antecedente histórico, puedes{" "}
          <Link
            href={`/convivencia/situaciones/${situacionGuardada}`}
            className={claseEnlace}
          >
            abrirla
          </Link>{" "}
          o registrar otra.
        </div>
      )}

      {
        // La clave vacía el formulario después de guardar, para registrar otra.
        <FormularioRegistro
          key={situacionGuardada ?? "nueva"}
          opciones={respuesta.datos}
          historico
        />
      }
    </>
  );
}
