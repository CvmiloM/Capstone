"""Pruebas del servicio con un Ollama simulado, sin red ni modelo real."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from convi_ia.aplicacion import crear_aplicacion, vectores_validos
from convi_ia.configuracion import (
    DIMENSIONES_EMBEDDING,
    MAXIMO_CUERPO,
    MODELO_EMBEDDING,
    Configuracion,
    ErrorConfiguracion,
)

TOKEN = "t" * 40
TEXTO_PRIVADO = "Reglamento interno, artículo 12: el estudiante Juan Pérez"


def vector(semilla: float = 0.1) -> list[float]:
    return [semilla + i / 10000 for i in range(DIMENSIONES_EMBEDDING)]


class OllamaFalso:
    """Responde como Ollama y guarda lo que recibió."""

    def __init__(self, responder=None) -> None:
        self.solicitudes: list[httpx.Request] = []
        self.responder = responder or self.normal

    @staticmethod
    def normal(solicitud: httpx.Request) -> httpx.Response:
        if solicitud.url.path == "/api/show":
            return httpx.Response(200, json={"details": {"family": "bert"}})
        cuerpo = json.loads(solicitud.content)
        vectores = [vector(0.1 + i) for i, _ in enumerate(cuerpo["input"])]
        return httpx.Response(
            200,
            json={"model": cuerpo["model"], "embeddings": vectores, "total_duration": 1},
        )

    def __call__(self, solicitud: httpx.Request) -> httpx.Response:
        self.solicitudes.append(solicitud)
        return self.responder(solicitud)


def cliente(ollama: OllamaFalso, token: str | None = None) -> TestClient:
    configuracion = Configuracion(ollama_url="http://ollama.test", token=token)
    return TestClient(crear_aplicacion(configuracion, httpx.MockTransport(ollama)))


def solicitud(textos: list[str] | None = None, **extra) -> dict:
    return {
        "model": MODELO_EMBEDDING,
        "input": textos or ["uno", "dos"],
        "truncate": False,
        **extra,
    }


def test_devuelve_un_vector_por_texto_en_el_mismo_orden():
    ollama = OllamaFalso()
    with cliente(ollama) as c:
        r = c.post("/api/embed", json=solicitud(["primero", "segundo", "tercero"]))
    assert r.status_code == 200
    datos = r.json()
    assert datos["model"] == MODELO_EMBEDDING
    assert set(datos) == {"model", "embeddings"}
    assert [v[0] for v in datos["embeddings"]] == [0.1, 1.1, 2.1]
    assert all(len(v) == DIMENSIONES_EMBEDDING for v in datos["embeddings"])
    enviado = json.loads(ollama.solicitudes[0].content)
    assert enviado == {
        "model": MODELO_EMBEDDING,
        "input": ["primero", "segundo", "tercero"],
        "truncate": False,
    }
    assert ollama.solicitudes[0].url.path == "/api/embed"


def test_acepta_lotes_de_ocho_como_los_manda_la_api():
    with cliente(OllamaFalso()) as c:
        r = c.post("/api/embed", json=solicitud([f"fragmento {i}" for i in range(8)]))
    assert r.status_code == 200
    assert len(r.json()["embeddings"]) == 8


@pytest.mark.parametrize("cabecera", [None, "Bearer otro-token-cualquiera-de-cuarenta-car", TOKEN])
def test_con_token_rechaza_sin_cabecera_o_con_otra(cabecera):
    ollama = OllamaFalso()
    with cliente(ollama, token=TOKEN) as c:
        r = c.post(
            "/api/embed",
            json=solicitud(),
            headers={"Authorization": cabecera} if cabecera else {},
        )
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    assert ollama.solicitudes == []


def test_con_token_correcto_responde():
    with cliente(OllamaFalso(), token=TOKEN) as c:
        r = c.post("/api/embed", json=solicitud(), headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 200


@pytest.mark.parametrize(
    "cuerpo",
    [
        solicitud(model="otro-modelo"),
        solicitud(truncate=True),
        solicitud(extra="campo"),
        solicitud(textos=[f"t{i}" for i in range(9)]),
        {"model": MODELO_EMBEDDING, "input": [], "truncate": False},
        {"model": MODELO_EMBEDDING, "input": "no es lista", "truncate": False},
        {"model": MODELO_EMBEDDING, "input": [1, 2], "truncate": False},
        solicitud(textos=["   "]),
        solicitud(textos=["x" * 8001]),
    ],
)
def test_rechaza_lo_que_no_cumple_el_contrato_sin_llamar_a_ollama(cuerpo):
    ollama = OllamaFalso()
    with cliente(ollama) as c:
        r = c.post("/api/embed", json=cuerpo)
    assert r.status_code == 400
    assert r.json()["detail"] == "La solicitud no cumple el contrato de embeddings"
    assert ollama.solicitudes == []


def test_el_error_no_devuelve_el_texto_recibido():
    with cliente(OllamaFalso()) as c:
        r = c.post("/api/embed", json=solicitud([TEXTO_PRIVADO], model="otro"))
        r2 = c.post("/api/embed", json=solicitud([TEXTO_PRIVADO + "x" * 8001]))
    assert r.status_code == r2.status_code == 400
    assert "Juan" not in r.text and "Juan" not in r2.text


def test_json_mal_formado():
    with cliente(OllamaFalso()) as c:
        r = c.post(
            "/api/embed", content=b"{no es json", headers={"Content-Type": "application/json"}
        )
    assert r.status_code == 400


def test_cuerpo_demasiado_grande_se_corta_antes_de_leerlo():
    ollama = OllamaFalso()
    with cliente(ollama) as c:
        r = c.post(
            "/api/embed",
            content=b"x" * (MAXIMO_CUERPO + 1),
            headers={"Content-Type": "application/json"},
        )
    assert r.status_code == 413
    assert ollama.solicitudes == []


def test_ollama_apagado_es_recuperable():
    def caido(solicitud: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sin conexión", request=solicitud)

    with cliente(OllamaFalso(caido)) as c:
        r = c.post("/api/embed", json=solicitud())
    # La API reintenta con 429 y 5xx, así un documento no queda fallido por un apagón.
    assert r.status_code == 503


def test_ollama_lento_es_recuperable():
    def lento(solicitud: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("tarde", request=solicitud)

    with cliente(OllamaFalso(lento)) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 503


def test_modelo_no_instalado_dice_como_instalarlo():
    def sin_modelo(_: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": f'model "{MODELO_EMBEDDING}" not found'})

    with cliente(OllamaFalso(sin_modelo)) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 503
    assert f"ollama pull {MODELO_EMBEDDING}" in r.json()["detail"]


def test_texto_mas_largo_que_el_modelo_no_se_reintenta():
    def largo(_: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "input length exceeds the context length"})

    with cliente(OllamaFalso(largo)) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 422


def test_otro_error_de_ollama():
    with cliente(OllamaFalso(lambda _: httpx.Response(500, text="boom"))) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 502


@pytest.mark.parametrize(
    "respuesta",
    [
        {"model": "otro", "embeddings": [vector(), vector()]},
        {"model": MODELO_EMBEDDING, "embeddings": [vector()]},
        {"model": MODELO_EMBEDDING, "embeddings": [vector(), vector()[:1023]]},
        {"model": MODELO_EMBEDDING, "embeddings": [vector(), [0.0] * DIMENSIONES_EMBEDDING]},
        {"model": MODELO_EMBEDDING, "embeddings": [vector(), [True] * DIMENSIONES_EMBEDDING]},
        {"model": MODELO_EMBEDDING, "embeddings": [vector(), [None] * DIMENSIONES_EMBEDDING]},
        {"model": MODELO_EMBEDDING, "embeddings": [vector(), [1e39] * DIMENSIONES_EMBEDDING]},
        {"model": MODELO_EMBEDDING},
    ],
)
def test_vectores_invalidos_de_ollama(respuesta):
    with cliente(OllamaFalso(lambda _: httpx.Response(200, json=respuesta))) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 502


def test_respuesta_de_ollama_que_no_es_json():
    with cliente(OllamaFalso(lambda _: httpx.Response(200, text="<html>"))) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 502


def test_respuesta_gigante_de_ollama_se_corta():
    with cliente(OllamaFalso(lambda _: httpx.Response(200, content=b" " * (3 * 1024 * 1024)))) as c:
        r = c.post("/api/embed", json=solicitud())
    assert r.status_code == 502


def test_infinito_en_json_se_rechaza():
    assert (
        vectores_validos({"model": MODELO_EMBEDDING, "embeddings": [[float("inf")] * 1024]}, 1)
        is None
    )


def test_salud_con_modelo_instalado():
    with cliente(OllamaFalso()) as c:
        r = c.get("/salud")
    assert r.status_code == 200
    assert r.json()["instalado"] is True


def test_salud_sin_modelo():
    with cliente(OllamaFalso(lambda _: httpx.Response(404, json={"error": "not found"}))) as c:
        r = c.get("/salud")
    assert r.status_code == 503
    assert "ollama pull" in r.json()["instalado"]


def test_salud_no_pide_token_y_no_expone_datos():
    with cliente(OllamaFalso(), token=TOKEN) as c:
        r = c.get("/salud")
    assert r.status_code == 200
    assert TOKEN not in r.text


def test_sin_documentacion_publica():
    with cliente(OllamaFalso()) as c:
        assert c.get("/docs").status_code == 404
        assert c.get("/openapi.json").status_code == 404


def test_configuracion_por_defecto():
    c = Configuracion.desde_entorno({})
    assert (c.ollama_url, c.token, c.host, c.puerto) == (
        "http://127.0.0.1:11434",
        None,
        "127.0.0.1",
        8000,
    )


@pytest.mark.parametrize(
    "entorno",
    [
        {"IA_HOST": "0.0.0.0"},
        {"IA_EMBEDDINGS_TOKEN": "corto"},
        {"OLLAMA_URL": "ftp://ollama"},
        {"OLLAMA_URL": "http://usuario:clave@ollama"},
        {"OLLAMA_URL": "no es url"},
        {"IA_PUERTO": "99999"},
        {"IA_PUERTO": "abc"},
    ],
)
def test_configuracion_insegura_o_invalida_no_arranca(entorno):
    with pytest.raises(ErrorConfiguracion):
        Configuracion.desde_entorno(entorno)


def test_fuera_del_equipo_con_token_si_arranca():
    c = Configuracion.desde_entorno({"IA_HOST": "0.0.0.0", "IA_EMBEDDINGS_TOKEN": f"  {TOKEN}  "})
    assert c.token == TOKEN
