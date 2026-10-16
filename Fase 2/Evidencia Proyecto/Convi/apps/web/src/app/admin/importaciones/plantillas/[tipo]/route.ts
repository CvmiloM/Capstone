import { pedirPlantilla } from "../../datos";
import { NOMBRE_TIPO } from "../../opciones";

// PB-020 (decisión del PO): descarga la plantilla XLSX de un tipo de datos
// (/admin/importaciones/plantillas/estudiantes). La arma la API con la misma
// lista de campos que usa para revisar las filas; aquí solo se pide con el
// token de la sesión, que el navegador no tiene.
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ tipo: string }> },
) {
  const { tipo } = await params;
  if (!Object.hasOwn(NOMBRE_TIPO, tipo.toUpperCase()))
    return texto("No hay plantilla para ese tipo de datos.", 404);

  const respuesta = await pedirPlantilla(tipo);
  if (!respuesta.ok)
    return texto(
      "No pudimos preparar la plantilla. Inténtalo de nuevo en unos minutos.",
      respuesta.status === 404 ? 404 : 503,
    );
  const contenido = await respuesta.arrayBuffer();
  return new Response(contenido, {
    headers: {
      "Content-Type":
        respuesta.headers.get("Content-Type") ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        respuesta.headers.get("Content-Disposition") ??
        `attachment; filename="plantilla-${tipo.toLowerCase()}.xlsx"`,
      "Content-Length": String(contenido.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}

function texto(mensaje: string, estado: number) {
  return new Response(mensaje, {
    status: estado,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}