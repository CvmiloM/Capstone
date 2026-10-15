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

function leerFicha(formData: FormData) {
  return {
    codigo_estudiante: leerTexto(formData, "codigo_estudiante"),
    nombres: leerTexto(formData, "nombres"),
    apellidos: leerTexto(formData, "apellidos"),
    rut: leerTexto(formData, "rut"),
    fecha_nacimiento: leerTexto(formData, "fecha_nacimiento"),
    correo: leerTexto(formData, "correo"),
    telefono: leerTexto(formData, "telefono"),
    direccion: leerTexto(formData, "direccion"),
  };
}

// PB-017 (HU-014 CA1 y CA2): crea la ficha y abre su página para matricularlo.
export async function crearEstudiante(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = leerFicha(formData);
  const resultado = await enviarCambio("POST", "/admin/estudiantes", valores);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/estudiantes");
  redirect(`/admin/estudiantes/${resultado.id}`);
}

// Decisión del PO: la ficha se corrige aquí; la base guarda en la auditoría
// el valor anterior, el nuevo y quién lo cambió.
export async function editarEstudiante(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "id");
  const valores = leerFicha(formData);
  const resultado = await enviarCambio(
    "PATCH",
    `/admin/estudiantes/${encodeURIComponent(id)}`,
    valores,
  );
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/estudiantes", "layout");
  return { listo: "Guardaste los cambios de la ficha.", valores };
}

// PB-018 (HU-014 CA3): la API toma el año del curso y revisa que no tenga
// otra matrícula en esas fechas.
export async function matricularEstudiante(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "estudiante_id");
  const valores = {
    curso_id: leerTexto(formData, "curso_id"),
    matriculado_en: leerTexto(formData, "matriculado_en"),
  };
  const resultado = await enviarCambio(
    "POST",
    `/admin/estudiantes/${encodeURIComponent(id)}/matriculas`,
    valores,
  );
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  // La matrícula cambia la nómina y los estudiantes de cada curso.
  revalidatePath("/admin/estudiantes", "layout");
  revalidatePath("/admin/cursos", "layout");
  return { listo: "Matriculaste al estudiante." };
}