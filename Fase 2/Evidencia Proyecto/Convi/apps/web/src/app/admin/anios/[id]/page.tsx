import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { NOMBRE_ESTADO, obtenerAnios } from "../datos";
import { FormularioAnio } from "../formulario-anio";

export const metadata: Metadata = { title: "Editar año académico" };

// Edita el año y sus fechas. El año se busca en el listado, que la API ya
// limita a la escuela de la sesión: un id de otra escuela no aparece.
export default async function PaginaEditarAnio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const anio = (await obtenerAnios()).find((a) => a.id === id);

  return (
    <>
      <Link href="/admin/anios" className={`text-sm ${claseEnlace}`}>
        ← Años académicos
      </Link>

      <div className="mt-4 max-w-xl">
        {!anio ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No encontramos ese año académico en tu escuela.
          </p>
        ) : anio.estado === "CERRADO" ? (
          <>
            <Encabezado titulo={`Año ${anio.anio}`} />
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Este año está cerrado, así que ya no se puede editar.
            </p>
          </>
        ) : (
          <>
            <Encabezado
              titulo={`Editar año ${anio.anio}`}
              descripcion={`Estado: ${NOMBRE_ESTADO[anio.estado]}. Para activarlo o cerrarlo, usa los botones del listado.`}
            />
            <div className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
              <FormularioAnio anio={anio} />
            </div>
          </>
        )}
      </div>
    </>
  );
}