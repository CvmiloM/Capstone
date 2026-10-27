"""Configuración del servicio, leída solo de variables de entorno."""

import os
from dataclasses import dataclass
from urllib.parse import urlsplit

# El esquema de la base (fragmentos_rag.embedding) exige este modelo y esta dimensión.
MODELO_EMBEDDING = "bge-m3:567m-fp16"
DIMENSIONES_EMBEDDING = 1024

# La API manda lotes de hasta 8 fragmentos de unos 1800 caracteres.
MAXIMO_TEXTOS = 8
MAXIMO_CARACTERES = 8000
MAXIMO_CUERPO = 256 * 1024
# Menos que los 60 segundos que espera la API, así ella recibe una respuesta clara.
ESPERA_OLLAMA = 55.0

# PB-118: el modelo que redacta las respuestas, decidido por el PO el 2026-10-26.
MODELO_GENERACION = "qwen3.5:9b"
# Con el modelo cargado responde en 1 a 2 segundos, pero cargarlo puede tardar cerca de un
# minuto, la API espera 120 segundos.
ESPERA_GENERACION = 110.0
# Ollama lo mantiene cargado este tiempo después de cada respuesta.
MANTENER_CARGADO = "30m"
MAXIMO_MENSAJES = 4
MAXIMO_CARACTERES_MENSAJE = 40000

LOCALES = {"127.0.0.1", "::1", "localhost"}
LARGO_MINIMO_TOKEN = 32


class ErrorConfiguracion(Exception):
    """La configuración no permite arrancar el servicio de forma segura."""


@dataclass(frozen=True)
class Configuracion:
    ollama_url: str = "http://127.0.0.1:11434"
    token: str | None = None
    host: str = "127.0.0.1"
    puerto: int = 8000

    @classmethod
    def desde_entorno(cls, entorno: dict[str, str] | None = None) -> Configuracion:
        e = os.environ if entorno is None else entorno
        token = (e.get("IA_EMBEDDINGS_TOKEN") or "").strip() or None
        puerto_texto = (e.get("IA_PUERTO") or "8000").strip()
        if not puerto_texto.isdigit() or not 0 < int(puerto_texto) < 65536:
            raise ErrorConfiguracion("IA_PUERTO debe ser un número de puerto válido")
        configuracion = cls(
            ollama_url=(e.get("OLLAMA_URL") or cls.ollama_url).strip().rstrip("/"),
            token=token,
            host=(e.get("IA_HOST") or cls.host).strip(),
            puerto=int(puerto_texto),
        )
        configuracion.validar()
        return configuracion

    def validar(self) -> None:
        url = urlsplit(self.ollama_url)
        if url.scheme not in ("http", "https") or not url.hostname:
            raise ErrorConfiguracion("OLLAMA_URL debe ser una dirección http o https")
        if url.username or url.password or url.query or url.fragment:
            raise ErrorConfiguracion(
                "OLLAMA_URL no puede llevar credenciales, consulta ni fragmento"
            )
        if self.token is not None and len(self.token) < LARGO_MINIMO_TOKEN:
            raise ErrorConfiguracion(
                f"IA_EMBEDDINGS_TOKEN debe tener al menos {LARGO_MINIMO_TOKEN} caracteres"
            )
        if self.host not in LOCALES and self.token is None:
            raise ErrorConfiguracion(
                "Para escuchar fuera de este equipo el servicio necesita IA_EMBEDDINGS_TOKEN"
            )
