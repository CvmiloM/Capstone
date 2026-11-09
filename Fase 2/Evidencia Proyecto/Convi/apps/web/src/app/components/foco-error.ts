// PB-136 (HU-116): cuando un formulario vuelve con errores, el foco va al
// primero, así el lector de pantalla lee su etiqueta y su error, y quien usa
// teclado sigue desde ahí en vez de volver al inicio de la página.

const CONTROLES =
  'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Enfoca, en el orden de la página, el primer aviso de error (role="alert"),
 * campo inválido (aria-invalid) o grupo de opciones con error (un fieldset
 * cuyo aria-describedby apunta a un mensaje "-error"). Devuelve si encontró uno.
 */
export function enfocarPrimerError(contenedor: ParentNode): boolean {
  const candidatos = contenedor.querySelectorAll<HTMLElement>(
    '[role="alert"], [aria-invalid="true"], fieldset[aria-describedby]',
  );
  for (const elemento of candidatos) {
    if (elemento.matches("fieldset")) {
      const ids = (elemento.getAttribute("aria-describedby") ?? "").split(/\s+/);
      const conError = ids.some(
        (id) => id.endsWith("-error") && document.getElementById(id),
      );
      const control = conError
        ? elemento.querySelector<HTMLElement>(CONTROLES)
        : null;
      if (!control) continue;
      control.focus();
      return true;
    }
    if (elemento.matches('[aria-invalid="true"]')) {
      if (elemento.matches(":disabled")) continue;
      elemento.focus();
      return true;
    }
    // Un aviso general: se puede enfocar sin entrar al orden del tabulador.
    if (!elemento.hasAttribute("tabindex")) elemento.setAttribute("tabindex", "-1");
    elemento.focus();
    return true;
  }
  return false;
}

/**
 * Después de cambiar de paso (por ejemplo, del QR al código), lleva el foco
 * al primer error o, si no hay, al primer título o aviso de estado del paso.
 */
export function enfocarPaso(contenedor: HTMLElement | null) {
  if (!contenedor || enfocarPrimerError(contenedor)) return;
  const destino = contenedor.querySelector<HTMLElement>('[role="status"], h2');
  if (!destino) return;
  if (!destino.hasAttribute("tabindex")) destino.setAttribute("tabindex", "-1");
  destino.focus();
}
