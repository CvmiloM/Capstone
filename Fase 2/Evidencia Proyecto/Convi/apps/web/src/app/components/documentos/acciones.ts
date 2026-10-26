"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guardar } from "./datos";
export type Estado = { mensaje?: string; errores?: Record<string, string> };
const texto = (f: FormData, c: string) =>
  typeof f.get(c) === "string" ? String(f.get(c)).trim() : "";
export async function cambiarDocumento(
  _anterior: Estado,
  f: FormData,
): Promise<Estado> {
  const accion = texto(f, "accion"),
    id = texto(f, "id"),
    version = texto(f, "version");
  let ruta: string, cuerpo: FormData | Record<string, string>;
  if (accion === "cargar") {
    ruta = id ? `/${encodeURIComponent(id)}/versiones` : "";
    const datos = new FormData();
    for (const c of ["titulo", "tipo_documento", "etiqueta_version"])
      datos.set(c, texto(f, c));
    const archivo = f.get("archivo");
    if (archivo instanceof File) datos.set("archivo", archivo);
    cuerpo = datos;
  } else {
    const rutas: Record<string, string> = {
      publicar: "publicacion",
      cerrar: "cierre-vigencia",
      archivar: "archivo",
      republicar: "republicacion",
    };
    if (!rutas[accion]) return { mensaje: "Acción no válida" };
    ruta = `/versiones/${encodeURIComponent(version)}/${rutas[accion]}`;
    cuerpo = {
      vigente_desde: texto(f, "vigente_desde"),
      vigente_hasta: texto(f, "vigente_hasta"),
    };
  }
  const resultado = await guardar(ruta, cuerpo);
  if (!resultado.ok)
    return { mensaje: resultado.mensaje, errores: resultado.errores };
  for (const portal of ["admin", "convivencia"])
    revalidatePath(`/${portal}/documentos`, "layout");
  const portal = texto(f, "portal") === "admin" ? "admin" : "convivencia";
  redirect(
    `/${portal}/documentos/${encodeURIComponent(resultado.id)}?guardado=1`,
  );
}
