import type { Metadata } from "next";
import Link from "next/link";
import { claseEnlace, Encabezado } from "@/app/components/formulario";
import { obtenerNiveles } from "../datos";
import { FormularioNivel } from "../formulario-nivel";

export const metadata: Metadata = { title: "Editar nivel educativo" };

// Edita el nivel. Se busca en el listado, que la API ya limita a la escuela
// de la sesión: un id de otra escuela no aparece.
export default async function PaginaEditarNivel({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nivel = (await obtenerNiveles()).find((n) => n.id === id);

  return (
    <>
      <Link href="/admin/niveles" className={`text-sm ${claseEnlace}`}>
        ← Niveles educativos
      </Link>

      <div className="mt-4 max-w-xl">
        {!nivel ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No encontramos ese nivel en tu escuela.
          </p>
        ) : (
          <>
            <Encabezado
              titulo={`Editar ${nivel.nombre}`}
              descripcion={`${nivel.activo ? "Activo" : "Inactivo"} · ${nivel.cursos} ${nivel.cursos === 1 ? "curso lo usa" : "cursos lo usan"}. Para activarlo o desactivarlo, usa el botón del listado.`}
            />
            <div className="rounded-2xl border border-border bg-card p-5 shadow-tarjeta">
              <FormularioNivel nivel={nivel} />
            </div>
          </>
        )}
      </div>
    </>
  );
}