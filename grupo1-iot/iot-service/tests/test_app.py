"""
Testes do iot-service (não precisam de banco nem de broker).
Rodar:  cd iot-service && pip install -r requirements-dev.txt && pytest -v
"""
import os
import sys
from datetime import datetime, timedelta, timezone

os.environ.update(AUTH_ENABLED="true", JWT_SECRET="segredo-de-teste", INGEST_API_KEY="chave-borda",
                  MQTT_SUBSCRIBE="false")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app as svc  # noqa: E402


class FakeRepo:
    """Imita o PostgresRepository, inclusive a deduplicação por msg_id."""
    def __init__(self):
        self.rows = []

    def insert_many(self, items):
        ids = {r["raw_payload"]["msg_id"] for r in self.rows}
        inserted = 0
        for t in items:
            if t.msg_id in ids:
                continue
            ids.add(t.msg_id)
            self.rows.append({
                "timestamp": t.timestamp, "machine_state": t.machine_state, "belt_speed": t.belt_speed,
                "start_button_pressed": t.buttons.start_pressed, "stop_button_pressed": t.buttons.stop_pressed,
                "emergency_pressed": t.buttons.emergency_pressed, "reset_pressed": t.buttons.reset_pressed,
                "raw_payload": t.model_dump(mode="json")})
            inserted += 1
        return inserted, len(items) - inserted

    def latest(self, machine_id=None):
        rows = [r for r in self.rows if not machine_id or r["raw_payload"]["machine_id"] == machine_id]
        return max(rows, key=lambda r: r["timestamp"]) if rows else None

    def history(self, minutes, limit):
        return sorted(self.rows, key=lambda r: r["timestamp"], reverse=True)[:limit]

    def ping(self):
        return True


@pytest.fixture()
def client():
    svc.app.state.repo = FakeRepo()
    with TestClient(svc.app) as c:
        yield c


def token(role, minutes=60, secret="segredo-de-teste"):
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": f"usr_{role.lower()}", "role": role, "iat": now,
                       "exp": now + timedelta(minutes=minutes)}, secret, algorithm="HS256")


def auth(role, **kw):
    return {"Authorization": f"Bearer {token(role, **kw)}"}


EDGE = {"X-API-Key": "chave-borda"}


def msg(msg_id, state="RUNNING", seconds_ago=0, **extra):
    ts = (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).isoformat()
    base = {"msg_id": msg_id, "machine_id": "SMART-40-PLANTA-N2", "timestamp": ts, "machine_state": state,
            "belt_speed": None, "event": "STATE_CHANGE", "seq": 1,
            "buttons": {"start_pressed": True, "stop_pressed": False, "emergency_pressed": False, "reset_pressed": False},
            "stations": {"processo": {"esteira1": True}}}
    base.update(extra)
    return base


# ------------------------------------------------------------------ ingestão
def test_ingest_exige_api_key(client):
    assert client.post("/api/v1/telemetry/ingest", json=msg("m-00000001")).status_code == 401


def test_ingest_unico_e_lote(client):
    r = client.post("/api/v1/telemetry/ingest", json=msg("m-00000001"), headers=EDGE)
    assert r.status_code == 200 and r.json() == {"received": 1, "inserted": 1, "duplicates": 0}
    r = client.post("/api/v1/telemetry/ingest", json=[msg("m-00000002"), msg("m-00000003")], headers=EDGE)
    assert r.json()["inserted"] == 2


def test_reenvio_pos_reconexao_nao_duplica(client):
    lote = [msg(f"m-0000000{i}", buffered=True) for i in range(5)]
    client.post("/api/v1/telemetry/ingest", json=lote, headers=EDGE)
    r = client.post("/api/v1/telemetry/ingest", json=lote, headers=EDGE)   # broker reentregou tudo
    assert r.json() == {"received": 5, "inserted": 0, "duplicates": 5}
    assert len(client.app.state.repo.rows) == 5


def test_payload_invalido_rejeitado(client):
    r = client.post("/api/v1/telemetry/ingest", json=msg("m-00000001", state="LIGADO"), headers=EDGE)
    assert r.status_code == 422
    r = client.post("/api/v1/telemetry/ingest", json=msg("m-00000002", belt_speed=-5), headers=EDGE)
    assert r.status_code == 422


def test_campos_extras_preservados_no_raw_payload(client):
    client.post("/api/v1/telemetry/ingest", json=msg("m-00000001"), headers=EDGE)
    assert client.app.state.repo.rows[0]["raw_payload"]["stations"]["processo"]["esteira1"] is True


# ------------------------------------------------------------------ leitura + RBAC
def test_status_sem_token_401(client):
    assert client.get("/api/v1/telemetry/status").status_code == 401


def test_status_token_expirado_401(client):
    assert client.get("/api/v1/telemetry/status", headers=auth("OPERATOR", minutes=-5)).status_code == 401


def test_status_assinatura_falsa_401(client):
    h = {"Authorization": f"Bearer {token('ADMIN', secret='chave-do-hacker')}"}
    assert client.get("/api/v1/telemetry/status", headers=h).status_code == 401


def test_status_404_sem_dados(client):
    assert client.get("/api/v1/telemetry/status", headers=auth("OPERATOR")).status_code == 404


def test_status_retorna_ultimo_estado(client):
    client.post("/api/v1/telemetry/ingest", headers=EDGE,
                json=[msg("m-00000001", "RUNNING", seconds_ago=10), msg("m-00000002", "EMERGENCY", seconds_ago=1,
                      buttons={"emergency_pressed": True})])
    for role in ("OPERATOR", "ENGINEER", "MANAGER", "ADMIN"):
        r = client.get("/api/v1/telemetry/status", headers=auth(role))
        assert r.status_code == 200
    d = r.json()
    assert d["machine_state"] == "EMERGENCY" and d["system_status"] == "EMERGENCY_STOP"
    assert d["buttons"]["emergency_active"] is True and d["edge_online"] is True
    # campos esperados pelo test_integration.py do professor
    assert {"start_button", "emergency_button", "conveyor_speed"} <= d.keys()


def test_status_borda_desconectada(client):
    client.post("/api/v1/telemetry/ingest", json=msg("m-00000001", seconds_ago=120), headers=EDGE)
    assert client.get("/api/v1/telemetry/status", headers=auth("OPERATOR")).json()["edge_online"] is False


def test_history(client):
    client.post("/api/v1/telemetry/ingest", json=[msg(f"m-0000000{i}") for i in range(3)], headers=EDGE)
    r = client.get("/api/v1/telemetry/history?limit=2", headers=auth("MANAGER"))
    assert r.status_code == 200 and r.json()["count"] == 2


# ------------------------------------------------------------------ comandos
def test_comando_operador_aceito(client):
    r = client.post("/api/v1/telemetry/commands", json={"command": "START", "parameter": "CONVEYOR_ON"},
                    headers=auth("OPERATOR"))
    assert r.status_code == 202 and r.json()["command"] == "START"


def test_comando_gestor_proibido_403(client):
    r = client.post("/api/v1/telemetry/commands", json={"command": "START"}, headers=auth("MANAGER"))
    assert r.status_code == 403


def test_comando_invalido_422(client):
    r = client.post("/api/v1/telemetry/commands", json={"command": "DESTRUIR"}, headers=auth("ADMIN"))
    assert r.status_code == 422


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"
