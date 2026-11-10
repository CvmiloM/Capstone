"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const claseBotonMenu =
  "presion inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function IconoMenu({ cerrar = false }: { cerrar?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {cerrar ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

/**
 * Menú de los portales. En el computador el menú lateral se ve siempre, como
 * antes. En el celular arriba queda una barra corta con la marca, los accesos
 * directos (por ejemplo, la campana de avisos) y el botón Menú, que abre el
 * menú completo en un cajón que entra desde la izquierda por encima de la
 * página. Es un <dialog> modal: el foco queda adentro, la página de atrás no
 * responde y Escape lo cierra devolviendo el foco al botón. También se cierra
 * al tocar afuera, con Cerrar o al elegir una sección.
 */
export function MenuPortal({
  marca,
  accesos,
  etiqueta = "Menú",
  claseCabecera = "gap-2",
  children,
}: {
  marca: ReactNode;
  /** Lo que se ve junto al botón en el celular, sin abrir el menú. */
  accesos?: ReactNode;
  /** Nombre del cajón para el lector de pantalla. */
  etiqueta?: string;
  claseCabecera?: string;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const dialogo = useRef<HTMLDialogElement>(null);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);

  const abrir = () => {
    const cajon = dialogo.current;
    if (!cajon || cajon.open) return;
    cajon.showModal();
    setAbierto(true);
    botonCerrar.current?.focus();
  };
  // Al cerrarse de cualquier forma, también con Escape, el foco vuelve al
  // botón Menú: Safari no lo enfoca al tocarlo, así que no basta con lo que
  // recuerda el navegador.
  const alCerrarse = () => {
    // Un aviso de cierre atrasado no cierra un cajón que se volvió a abrir.
    if (dialogo.current?.open) return;
    setAbierto(false);
    botonMenu.current?.focus();
  };
  const cerrar = () => {
    dialogo.current?.close();
    alCerrarse();
  };

  useEffect(() => {
    if (!abierto) return;
    // La página de atrás no se desplaza mientras el cajón está abierto.
    const raiz = document.documentElement;
    const desplazamiento = raiz.style.overflow;
    raiz.style.overflow = "hidden";
    // Si la pantalla pasa a tamaño computador, el menú ya está a la vista.
    const computador = window.matchMedia("(min-width: 64rem)");
    const alCambiar = () => {
      if (computador.matches) dialogo.current?.close();
    };
    computador.addEventListener("change", alCambiar);
    return () => {
      raiz.style.overflow = desplazamiento;
      computador.removeEventListener("change", alCambiar);
    };
  }, [abierto]);

  return (
    <>
      <div className={`flex items-center px-4 pt-4 pb-3 ${claseCabecera}`}>
        {marca}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          {accesos}
          <button
            ref={botonMenu}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={abierto}
            aria-controls={id}
            onClick={abrir}
            className={claseBotonMenu}
          >
            <IconoMenu />
            Menú
          </button>
        </div>
      </div>

      {/* En el computador, el menú lateral de siempre. */}
      <div className="hidden lg:block">{children}</div>

      <dialog
        ref={dialogo}
        id={id}
        aria-label={etiqueta}
        onClose={alCerrarse}
        onClick={(evento) => {
          // Tocar el fondo, fuera del cajón, o elegir una sección lo cierra.
          if (
            evento.target === evento.currentTarget ||
            (evento.target instanceof Element &&
              evento.target.closest("a[href]"))
          )
            cerrar();
        }}
        className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(20rem,calc(100%-3rem))] max-w-none -translate-x-full overflow-y-auto border-0 border-r border-border bg-card p-0 text-foreground shadow-xl transition-[translate,overlay,display] transition-discrete duration-[420ms] ease-resorte backdrop:bg-foreground/35 backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-300 open:translate-x-0 open:backdrop:opacity-100 starting:open:-translate-x-full starting:open:backdrop:opacity-0 lg:hidden"
      >
        <div className={`flex items-center px-4 pt-4 pb-3 ${claseCabecera}`}>
          {marca}
          <button
            ref={botonCerrar}
            type="button"
            onClick={cerrar}
            className={`ml-auto ${claseBotonMenu}`}
          >
            <IconoMenu cerrar />
            Cerrar
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}
