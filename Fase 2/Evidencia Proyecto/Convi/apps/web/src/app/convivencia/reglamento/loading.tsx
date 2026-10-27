// PB-117: pantalla de carga de la consulta del reglamento. Cada ruta necesita la suya
// (cacheComponents), igual que las demás secciones del portal.
export default function CargandoReglamento() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="mb-2 h-8 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
      <div className="mb-6 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="h-44 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
