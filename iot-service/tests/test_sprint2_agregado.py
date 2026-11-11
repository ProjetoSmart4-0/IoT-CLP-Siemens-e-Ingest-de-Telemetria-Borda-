"""Sprint 2: a mensagem agregada de 500 ms (schema 1.1) do flow_ingestao_n2.json
é aceita pelo iot-service, preserva o bloco "aggregation" e não duplica no reenvio da outbox."""
import json
from pathlib import Path

from test_app import EDGE as HDR, client  # noqa: F401  (fixture e cabeçalho da API key)

EXEMPLO = Path(__file__).resolve().parents[2] / "contracts/events/exemplos/telemetria-agregada-v1.1.json"


def carregar():
    return json.loads(EXEMPLO.read_text(encoding="utf-8"))


def test_mensagem_agregada_aceita_e_preservada(client):  # noqa: F811
    msg = carregar()
    r = client.post("/api/v1/telemetry/ingest", json=msg, headers=HDR)
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] == 1
    raw = client.app.state.repo.rows[0]["raw_payload"]
    assert raw["schema_version"] == "1.1"
    assert raw["aggregation"]["window_ms"] == 500
    assert raw["aggregation"]["samples"] >= 1


def test_reenvio_da_outbox_nao_duplica(client):  # noqa: F811
    msg = carregar()
    client.post("/api/v1/telemetry/ingest", json=msg, headers=HDR)
    msg["buffered"] = True  # mesma mensagem reenviada pela outbox (sem PUBACK)
    r = client.post("/api/v1/telemetry/ingest", json=[msg, msg], headers=HDR)
    assert r.json() == {"received": 2, "inserted": 0, "duplicates": 2}
