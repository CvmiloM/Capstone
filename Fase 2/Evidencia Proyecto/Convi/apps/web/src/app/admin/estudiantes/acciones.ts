"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarCambio, obtenerApoderados } from "./datos";

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

// PB-022 y PB-031 (HU-017 y HU-024): cambio de curso, paso de año, egreso o
// retiro. La API termina la matrícula vigente y, si corresponde, abre la nueva.
export async function cambiarMatricula(
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = leerTexto(formData, "estudiante_id");
  const valores = {
    tipo: leerTexto(formData, "tipo"),
    matricula_id: leerTexto(formData, "matricula_id"),
    curso_id: leerTexto(formData, "curso_id"),
    fecha: leerTexto(formData, "fecha"),
    motivo: leerTexto(formData, "motivo"),
  };
  const resultado = await enviarCambio(
    "POST",
    `/admin/estudiantes/${encodeURIComponent(id)}/movimientos`,
    valores,
  );
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  revalidatePath("/admin/estudiantes", "layout");
  revalidatePath("/admin/cursos", "layout");
  redirect(
    `/admin/estudiantes/${encodeURIComponent(id)}?cambio=${encodeURIComponent(valores.tipo)}`,
  );
}

export async function vincularApoderado(
  estudianteId: string,
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const campos = [
    "modo",
    "persona_apoderado_id",
    "nombres",
    "apellidos",
    "rut",
    "correo",
    "telefono",
    "direccion",
    "tipo_relacion",
    "activo_desde",
    "activo_hasta",
  ];
  const valores = Object.fromEntries(
    campos.map((campo) => [campo, leerTexto(formData, campo)]),
  );
  valores.es_principal = formData.get("es_principal") === "on" ? "1" : "0";
  valores.puede_ser_contactado =
    formData.get("puede_ser_contactado") === "on" ? "1" : "0";
  const existente = valores.modo === "existente";
  if (existente && !valores.persona_apoderado_id)
    return {
      valores,
      errores: { persona_apoderado_id: "Busca y selecciona un apoderado" },
      mensaje: "No se guardó el vínculo",
    };
  const resultado = await enviarCambio(
    "POST",
    `/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados`,
    {
      persona_apoderado_id: existente
        ? valores.persona_apoderado_id
        : undefined,
      persona: existente ? undefined : valores,
      tipo_relacion: valores.tipo_relacion,
      es_principal: valores.es_principal === "1",
      puede_ser_contactado: valores.puede_ser_contactado === "1",
      activo_desde: valores.activo_desde,
      activo_hasta: valores.activo_hasta,
    },
  );
  if (!resultado.ok)
    return { valores, mensaje: resultado.errores?.correo ?? resultado.mensaje, errores: resultado.errores };
  revalidatePath(`/admin/estudiantes/${estudianteId}`, "layout");
  redirect(
    `/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados?vinculo=creado`,
  );
}

export async function buscarPersonasApoderadas(
  estudianteId: string,
  buscar: string,
) {
  const texto = typeof buscar === "string" ? buscar.trim() : "";
  if (texto.length < 2 || texto.length > 100)
    return {
      ok: false as const,
      mensaje: "Escribe entre 2 y 100 caracteres para buscar",
    };
  const datos = await obtenerApoderados(estudianteId, texto);
  if (!datos)
    return {
      ok: false as const,
      mensaje: "No encontramos ese estudiante en tu escuela",
    };
  return { ok: true as const, personas: datos.personas };
}

export async function terminarVinculo(
  estudianteId: string,
  vinculoId: string,
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = { activo_hasta: leerTexto(formData, "activo_hasta") };
  const resultado = await enviarCambio(
    "PATCH",
    `/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados/${encodeURIComponent(vinculoId)}/termino`,
    valores,
  );
  if (!resultado.ok)
    return { valores, mensaje: resultado.mensaje, errores: resultado.errores };
  revalidatePath(`/admin/estudiantes/${estudianteId}`, "layout");
  redirect(
    `/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados?vinculo=terminado`,
  );
}

// PB-021 (HU-016): corrige los datos personales del contacto de un vínculo.
// La API revisa que no se convierta en otra persona y que el RUT no se repita.
export async function corregirContacto(
  estudianteId: string,
  vinculoId: string,
  _anterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const campos = [
    "nombres",
    "apellidos",
    "rut",
    "correo",
    "telefono",
    "direccion",
  ];
  const valores = Object.fromEntries(
    campos.map((campo) => [campo, leerTexto(formData, campo)]),
  );
  const resultado = await enviarCambio(
    "PATCH",
    `/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados/${encodeURIComponent(vinculoId)}/persona`,
    valores,
  );
  if (!resultado.ok)
    return { valores, mensaje: resultado.mensaje, errores: resultado.errores };
  // La misma persona puede ser apoderada de otros estudiantes.
  revalidatePath("/admin/estudiantes", "layout");
  redirect(
    `/admin/estudiantes/${encodeURIComponent(estudianteId)}/apoderados?vinculo=corregido`,
  );
}
