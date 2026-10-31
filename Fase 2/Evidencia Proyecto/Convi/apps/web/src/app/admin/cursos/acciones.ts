"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio } from "./datos";

export type EstadoFormulario = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
  /** Confirmación de lo guardado, sobre el formulario. */
  listo?: string;
};

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

function leerCurso(formData: FormData) {
  return {
    codigo: leerTexto(formData, "codigo"),
    nombre: leerTexto(formData, "nombre"),
    seccion: leerTexto(formData, "seccion"),
    nivel_id: leerTexto(formData, "nivel_id"),
  };
}

// PB-015 (HU-013 CA1): crea el curso en el año elegido y abre su página para
// asignarle profesores.
export async function crearCurso(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = {
    ...leerCurso(formData),
    anio_academico_id: leerTexto(formData, "anio_academico_id"),
  };
  const resultado = await enviarCambio("POST", "/admin/cursos", valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/cursos");
  redirect(`/admin/cursos/${resultado.id}`);
}

// Decisión del PO: el código, el nombre y la sección cambian siempre; el
// nivel, solo si el curso no tiene estudiantes. La API lo exige igual.
export async function editarCurso(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "id");
  const motivo = leerTexto(formData, "motivo");
  const valores = leerCurso(formData);
  // PB-023: en un año Cerrado se envía el motivo de la corrección.
  const resultado = await enviarCambio(
    "PATCH",
    `/admin/cursos/${encodeURIComponent(id)}`,
    motivo ? { ...valores, motivo } : valores,
  );
  if (!resultado.ok) {
    return {
      mensaje: resultado.mensaje,
      errores: resultado.errores,
      valores: { ...valores, motivo },
    };
  }
  revalidatePath("/admin/cursos", "layout");
  return {
    listo: motivo
      ? "Corregiste el curso, la corrección y su motivo quedaron en la auditoría."
      : "Guardaste los cambios del curso.",
    valores,
  };
}

// HU-013 CA2 y CA3: la API revisa que sea un profesor de la escuela y que no
// se repita con fechas que se cruzan.
export async function asignarProfesor(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const cursoId = leerTexto(formData, "curso_id");
  const valores = {
    membresia_id: leerTexto(formData, "membresia_id"),
    rol: leerTexto(formData, "rol"),
    fecha_inicio: leerTexto(formData, "fecha_inicio"),
    fecha_fin: leerTexto(formData, "fecha_fin"),
    motivo: leerTexto(formData, "motivo"),
  };
  const resultado = await enviarCambio(
    "POST",
    `/admin/cursos/${encodeURIComponent(cursoId)}/asignaciones`,
    {
      ...valores,
      fecha_fin: valores.fecha_fin || null,
      motivo: valores.motivo || undefined,
    },
  );
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/cursos", "layout");
  return {
    listo: valores.motivo
      ? "Agregaste al profesor como corrección, el motivo quedó en la auditoría."
      : "Asignaste al profesor al curso.",
  };
}

// HU-013 CA4: registra el último día de la asignación. No se puede deshacer.
export async function terminarAsignacion(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "asignacion_id");
  const fechaFin = leerTexto(formData, "fecha_fin");
  // PB-023: en un año Cerrado es una corrección del término, con motivo.
  const motivo = leerTexto(formData, "motivo");
  const resultado = await enviarCambio(
    "PATCH",
    `/admin/asignaciones/${encodeURIComponent(id)}/termino`,
    motivo ? { fecha_fin: fechaFin, motivo } : { fecha_fin: fechaFin },
  );
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.errores?.fecha_fin ??
        resultado.errores?.motivo ??
        resultado.mensaje,
      valores: { fecha_fin: fechaFin, motivo },
    };
  }
  revalidatePath("/admin/cursos", "layout");
  return {};
}