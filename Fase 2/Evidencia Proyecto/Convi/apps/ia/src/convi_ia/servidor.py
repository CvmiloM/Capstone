"""Arranque del servicio: uv run --directory apps/ia convi-ia (desde la carpeta Convi)."""

import logging
import sys

import uvicorn

from .aplicacion import crear_aplicacion
from .configuracion import Configuracion, ErrorConfiguracion

registro = logging.getLogger("convi_ia")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    # Cada llamada a Ollama ya queda en el registro propio, sin repetirla línea por línea.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        configuracion = Configuracion.desde_entorno()
    except ErrorConfiguracion as error:
        sys.exit(f"convi-ia no arrancó: {error}")
    registro.info(
        "convi-ia en http://%s:%d/api/embed, Ollama en %s, token %s",
        configuracion.host,
        configuracion.puerto,
        configuracion.ollama_url,
        "exigido" if configuracion.token else "desactivado, solo para este equipo",
    )
    uvicorn.run(
        crear_aplicacion(configuracion),
        host=configuracion.host,
        port=configuracion.puerto,
        log_level="info",
        server_header=False,
        proxy_headers=False,
    )
