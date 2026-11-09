// PB-136 (HU-116): primer elemento del tabulador en los portales. Queda oculto
// hasta que recibe el foco y lleva directo al contenido, sin recorrer el menú.
// El <main> de cada portal tiene id="contenido" y tabIndex={-1}.
export function SaltarContenido() {
  return (
    <a
      href="#contenido"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
    >
      Saltar al contenido
    </a>
  );
}
