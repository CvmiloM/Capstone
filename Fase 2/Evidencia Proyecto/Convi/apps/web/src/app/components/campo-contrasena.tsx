"use client";

import { useState, type ComponentProps } from "react";
import { Campo } from "./formulario";

export function CampoContrasena(
  props: Omit<ComponentProps<typeof Campo>, "type" | "accesorio">,
) {
  const [visible, setVisible] = useState(false);

  return (
    <Campo
      {...props}
      type={visible ? "text" : "password"}
      accesorio={
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-controls={props.id ?? props.name}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      }
    />
  );
}
