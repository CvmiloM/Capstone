import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Una pestaña de la versión anterior debe recargar después del despliegue.
  deploymentId: process.env.DEPLOYMENT_ID,
  async headers() {
    const produccion = process.env.NODE_ENV === "production";
    // shortcut: CSP permite inline con Cache Components; revisar nonces/hashes al cambiar el renderizado.
    const politica = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${produccion ? "" : " 'unsafe-eval'"}`,
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${produccion ? "" : " ws: wss:"}`,
      "object-src 'none'",
      "base-uri 'none'",
      // El visor de documentos incrusta los PDF del propio portal.
      "frame-ancestors 'self'",
      "frame-src 'self'",
      "form-action 'self'",
      ...(produccion ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    const recuperacion = [
      "/recuperar-contrasena",
      "/restablecer-contrasena",
      "/confirmar-correo",
      "/registro/confirmar",
    ].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }));
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: politica },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(produccion ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }] : []),
        ],
      },
      ...recuperacion,
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // PB-019: las importaciones suben archivos de hasta 5 MB por una acción
      // de servidor (el límite por defecto es 1 MB). PB-066: las evidencias
      // llegan hasta 25 MB (PB-130). El margen cubre lo que agrega el
      // formulario multipart; la API vuelve a revisar cada archivo.
      bodySizeLimit: "26mb",
    },
  },
  logging: {
    // Los formularios llevan contraseñas y los enlaces llevan tokens: no registrarlos.
    serverFunctions: false,
    incomingRequests: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
