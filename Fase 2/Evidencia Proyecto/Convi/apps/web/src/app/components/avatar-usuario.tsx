import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";

/**
 * Blob animado de una persona (blobatar, licencia MIT). Se genera en CONVI a
 * partir del correo, que la librería pasa a minúsculas y sin espacios, así que el
 * mismo correo siempre da el mismo blob y no se guarda nada en la base. Nunca se
 * usa el servicio web de blobatar, para que los correos no salgan de CONVI.
 */
export function AvatarUsuario({
  correo,
  tamano = 32,
  siempre = false,
  className = "",
}: {
  correo: string;
  /** Tamaño en píxeles. */
  tamano?: number;
  /** Animado todo el tiempo, para el blob propio, o solo al pasar el mouse. */
  siempre?: boolean;
  className?: string;
}) {
  return (
    <Blobatar
      name={correo}
      size={tamano}
      background="circle"
      animate={siempre ? "always" : "hover"}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    />
  );
}
