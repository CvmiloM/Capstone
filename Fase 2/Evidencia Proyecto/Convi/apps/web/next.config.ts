import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Una pestaña de la versión anterior debe recargar después del despliegue.
  deploymentId: process.env.DEPLOYMENT_ID,
  async headers() {
    const recuperacion = [
      "/recuperar-contrasena",
      "/restablecer-contrasena",
    ].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }));
    return process.env.NODE_ENV === "production"
      ? [
          ...recuperacion,
          {
            source: "/:path*",
            headers: [
              { key: "Strict-Transport-Security", value: "max-age=15552000" },
            ],
          },
        ]
      : recuperacion;
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
