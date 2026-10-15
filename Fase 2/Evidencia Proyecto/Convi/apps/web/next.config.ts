import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // PB-019: las importaciones suben archivos de hasta 5 MB por una acción
      // de servidor (el límite por defecto es 1 MB). El margen cubre lo que
      // agrega el formulario multipart.
      bodySizeLimit: "6mb",
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
