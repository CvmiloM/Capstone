"use server";

import { redirect } from "next/navigation";
import {
  enviarAclaracion,
  enviarCambioResponsable,
  enviarCambioUrgencia,
  enviarCaso,
  enviarDecision,
  enviarInicioRevision,
  enviarRevisionNormativa,
  enviarRevisionNormativaCaso,
  enviarVinculacion,
} from "../../datos";

export type EstadoAccion = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Lo enviado, para no perderlo si hay errores. */
  valores?: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_VALIDA = "La situación no es válida. Vuelve a la bandeja.";

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-053 (HU-046): abre un caso desde la situación. La API lo crea En
// análisis con su código, pasa los estudiantes al caso y deja la situación
// vinculada, todo junto; al terminar se abre el caso nuevo.
export async function abrirCaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    titulo: leerTexto(formData, "titulo"),
    resumen: leerTexto(formData, "resumen"),
    fecha_inicio: leerTexto(formData, "fecha_inicio"),
    categoria_principal_id: leerTexto(formData, "categoria_principal_id"),
    responsable_id: leerTexto(formData, "responsable_caso_id"),
    justificacion_independiente: leerTexto(
      formData,
      "justificacion_independiente",
    ),
    motivo_reconsideracion: leerTexto(formData, "motivo_reconsideracion"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarCaso(id, {
    ...valores,
    revision_anterior_id: leerTexto(formData, "revision_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/casos/${resultado.id}?aviso=creado`);
}

// PB-052 (HU-045): vincula la situación al caso que se eligió y confirmó.
// La API registra la decisión Vinculada a caso con su fundamento y la
// situación aparece en el caso, que se abre al terminar.
export async function vincularCaso(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    caso_id: leerTexto(formData, "caso_id"),
    fundamento: leerTexto(formData, "fundamento_vinculacion"),
    motivo_reconsideracion: leerTexto(formData, "motivo_reconsideracion"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarVinculacion(id, {
    ...valores,
    revision_anterior_id: leerTexto(formData, "revision_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/casos/${resultado.id}?aviso=vinculada`);
}

// PB-047, PB-048 y PB-051: guarda la situación como antecedente o la
// descarta. Se envía también la última revisión que se veía, para que la API
// rechace la decisión si otra persona agregó una entretanto (PB-139).
// PB-050: las tres decisiones (esta, abrir caso y vincular) llevan el motivo
// de la reconsideración cuando la situación ya tenía una decisión.
export async function registrarDecision(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    resultado: leerTexto(formData, "resultado"),
    motivo_descarte: leerTexto(formData, "motivo_descarte"),
    codigo_original: leerTexto(formData, "codigo_original"),
    fundamento: leerTexto(formData, "fundamento_decision"),
    motivo_reconsideracion: leerTexto(formData, "motivo_reconsideracion"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarDecision(id, {
    ...valores,
    revision_anterior_id: leerTexto(formData, "revision_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(
    `/convivencia/situaciones/${id}?aviso=${valores.resultado === "DESCARTADA" ? "descartada" : "antecedente"}`,
  );
}

// PB-044 (HU-037 CA2): pasa una situación Nueva a En revisión. La API
// comprueba el perfil, la escuela y el estado actual.
export async function iniciarRevision(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  if (!UUID.test(id)) return { mensaje: NO_VALIDA };
  const resultado = await enviarInicioRevision(id);
  if (!resultado.ok) return { mensaje: resultado.mensaje };
  redirect(`/convivencia/situaciones/${id}?aviso=revision`);
}

// PB-044 (HU-037 CA3): cambia la urgencia con un motivo. Se envía también la
// urgencia que se veía, para que la API rechace el cambio si otra persona la
// modificó entretanto (PB-139).
export async function cambiarUrgencia(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    urgencia: leerTexto(formData, "urgencia"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarCambioUrgencia(id, {
    ...valores,
    urgencia_anterior: leerTexto(formData, "urgencia_anterior"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/situaciones/${id}?aviso=urgencia`);
}

// PB-046 (HU-039): asigna o cambia a quien revisa la situación. Se envía
// también el responsable que se veía, para que la API rechace el cambio si
// otra persona lo modificó entretanto (CA2). El estado no cambia (CA4).
export async function asignarResponsable(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = {
    responsable_id: leerTexto(formData, "responsable_id"),
    motivo: leerTexto(formData, "motivo"),
  };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarCambioResponsable(id, {
    ...valores,
    responsable_anterior_id: leerTexto(formData, "responsable_anterior_id"),
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/situaciones/${id}?aviso=responsable`);
}

// Mismo tope de páginas consultadas que valida la API (revision-normativa.ts).
// Un archivo "use server" solo exporta funciones, por eso no se exporta.
const MAXIMO_REFERENCIAS = 10;

// PB-155 (HU-134): registra lo que indica el reglamento o el protocolo. Cada
// página consultada llega como ref_documento_N, ref_desde_N, ref_hasta_N y
// ref_seccion_N; las filas vacías se ignoran. La situación no cambia de estado.
// PB-082 (HU-071 CA2): el mismo formulario registra la revisión de un caso
// que sigue sin protocolo; entonces llega caso_id en vez de situacion_id.
export async function registrarRevisionNormativa(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const casoId = leerTexto(formData, "caso_id");
  const id = casoId || leerTexto(formData, "situacion_id");
  const valores: Record<string, string> = {};
  for (const [campo, valor] of formData.entries()) {
    if (typeof valor === "string" && !campo.startsWith("$")) {
      valores[campo] = valor.trim();
    }
  }
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };

  const referencias = [];
  for (let n = 0; n < MAXIMO_REFERENCIAS; n++) {
    const fila = {
      version_documento_id: valores[`ref_documento_${n}`] ?? "",
      pagina_desde: valores[`ref_desde_${n}`] ?? "",
      pagina_hasta: valores[`ref_hasta_${n}`] ?? "",
      titulo_seccion: valores[`ref_seccion_${n}`] ?? "",
    };
    if (Object.values(fila).some(Boolean)) referencias.push(fila);
  }
  const cuerpo = {
    aplicabilidad: valores.aplicabilidad ?? "",
    modo_revision: valores.modo_revision ?? "",
    fundamento: valores.fundamento ?? "",
    version_protocolo_id: valores.version_protocolo_id ?? "",
    referencias,
  };
  const resultado = casoId
    ? await enviarRevisionNormativaCaso(id, cuerpo)
    : await enviarRevisionNormativa(id, cuerpo);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(
    casoId
      ? `/convivencia/casos/${id}?aviso=normativa`
      : `/convivencia/situaciones/${id}?aviso=normativa`,
  );
}

// PB-045 (HU-038): pide información al profesor que registró la situación.
// La API guarda la pregunta y pasa la situación a Información solicitada en
// la misma operación; el profesor la responde desde sus registros (PB-049).
export async function pedirAclaracion(
  _anterior: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const id = leerTexto(formData, "situacion_id");
  const valores = { pregunta: leerTexto(formData, "pregunta") };
  if (!UUID.test(id)) return { mensaje: NO_VALIDA, valores };
  const resultado = await enviarAclaracion(id, valores.pregunta);
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/convivencia/situaciones/${id}?aviso=aclaracion`);
}
