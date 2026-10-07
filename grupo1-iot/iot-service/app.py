"""
iot-service — Microsserviço de Ingestão de Telemetria (Grupo 1 · SMART 4.0 · Planta N2)
=======================================================================================
Recebe a telemetria publicada pelo gateway Node-RED (CLP Siemens S7-1200) e grava
na tabela `telemetry_logs` do Neon Serverless Postgres.

Duas formas de entrada (ambas usam a MESMA função de gravação):
  1. Assinante MQTT  (MQTT_SUBSCRIBE=true) — escuta `industria40/telemetry/data` no HiveMQ Cloud.
  2. HTTP            POST /api/v1/telemetry/ingest  (lote ou mensagem única, header X-API-Key).

Idempotência: cada mensagem traz `msg_id` gerado na borda. Mensagens reenviadas após uma
queda de rede (store-and-forward) NÃO são gravadas duas vezes.

Rotas (contrato openapi-spec.yaml, prefixo /api/v1):
  GET  /health
  POST /api/v1/telemetry/ingest      -> borda/bridge   (X-API-Key)
  GET  /api/v1/telemetry/status      -> OPERATOR, ENGINEER, MANAGER, ADMIN (JWT)
  GET  /api/v1/telemetry/history     -> OPERATOR, ENGINEER, MANAGER, ADMIN (JWT)
  POST /api/v1/telemetry/commands    -> OPERATOR, ENGINEER, ADMIN (JWT)  [stub Sprint 1]

Executar localmente:
  pip install -r requirements.txt
  uvicorn app:app --reload --port 8080       (docs interativas em http://localhost:8080/docs)
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import ssl
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

import jwt
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s [iot-service] %(message)s")
log = logging.getLogger("iot-service")

# =============================================================================
# CONFIGURAÇÃO (tudo via variáveis de ambiente — nunca coloque segredos no código)
# =============================================================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin_40:senha_segura_40@localhost:5432/industria40_db")
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() == "true"
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
INGEST_API_KEY = os.getenv("INGEST_API_KEY", "")

MQTT_SUBSCRIBE = os.getenv("MQTT_SUBSCRIBE", "false").lower() == "true"
MQTT_HOST = os.getenv("MQTT_HOST", "")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_TLS = os.getenv("MQTT_TLS", "true").lower() == "true"
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "iot-service-grupo1")
MQTT_TOPIC_DATA = os.getenv("MQTT_TOPIC_DATA", "industria40/telemetry/data")
MQTT_TOPIC_COMMANDS = os.getenv("MQTT_TOPIC_COMMANDS", "industria40/telemetry/commands")

# Se a última telemetria tiver mais que isso, consideramos a borda DESCONECTADA
EDGE_STALE_SECONDS = int(os.getenv("EDGE_STALE_SECONDS", "15"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

ROLES_READ = {"OPERATOR", "ENGINEER", "MANAGER", "ADMIN"}
ROLES_COMMAND = {"OPERATOR", "ENGINEER", "ADMIN"}   # Gestor não aciona a máquina física

MachineState = Literal["STOPPED", "RUNNING", "PAUSED", "EMERGENCY", "ALARM"]  # = ENUM do banco


# =============================================================================
# MODELOS (contrato da mensagem Borda -> Nuvem)
# =============================================================================
class Buttons(BaseModel):
    start_pressed: bool = False
    stop_pressed: bool = False
    emergency_pressed: bool = False
    reset_pressed: bool = False


class TelemetryIn(BaseModel):
    """Mensagem publicada pelo Node-RED. Campos extras (stations, flags...) são aceitos
    e preservados integralmente em raw_payload (JSONB)."""
    model_config = ConfigDict(extra="allow")

    msg_id: str = Field(..., min_length=8, max_length=120, description="Chave de idempotência gerada na borda")
    machine_id: str = Field("SMART-40-PLANTA-N2", max_length=60)
    timestamp: datetime = Field(..., description="Momento da LEITURA no CLP (não o da gravação)")
    machine_state: MachineState
    belt_speed: Optional[float] = Field(None, ge=0, le=999.99)   # NUMERIC(5,2)
    buttons: Buttons = Buttons()
    event: Optional[str] = None
    seq: Optional[int] = None
    buffered: bool = False

    @field_validator("timestamp")
    @classmethod
    def _ensure_tz(cls, v: datetime) -> datetime:
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


class IngestResult(BaseModel):
    received: int
    inserted: int
    duplicates: int


class MachineCommand(BaseModel):
    model_config = ConfigDict(extra="allow")
    command: Literal["START", "STOP", "RESET", "EMERGENCY", "EMERGENCY_STOP"]
    parameters: Optional[Dict[str, Any]] = None


# =============================================================================
# REPOSITÓRIO (acesso ao Postgres/Neon)
# =============================================================================
INSERT_SQL = """
INSERT INTO telemetry_logs
    (timestamp, machine_state, belt_speed, start_button_pressed, stop_button_pressed,
     emergency_pressed, reset_pressed, raw_payload)
SELECT %s, %s::machine_state, %s, %s, %s, %s, %s, %s::jsonb
WHERE NOT EXISTS (SELECT 1 FROM telemetry_logs WHERE raw_payload->>'msg_id' = %s)
ON CONFLICT DO NOTHING
RETURNING id;
"""
# WHERE NOT EXISTS  -> evita duplicata mesmo sem o índice único (mais lento)
# ON CONFLICT       -> garantia forte quando a migração 001 (índice único em msg_id) existir

SELECT_COLS = """id, timestamp, machine_state::text AS machine_state, belt_speed,
                 start_button_pressed, stop_button_pressed, emergency_pressed, reset_pressed, raw_payload"""


class PostgresRepository:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self._pool = None
        self._lock = threading.Lock()

    def _get_pool(self):
        from psycopg2.pool import ThreadedConnectionPool
        with self._lock:
            if self._pool is None:
                self._pool = ThreadedConnectionPool(1, 5, dsn=self.dsn, connect_timeout=10)
            return self._pool

    def _run(self, fn):
        """Executa fn(cursor) numa transação. Se o Neon derrubou a conexão ociosa
        (scale-to-zero), descarta a conexão e tenta mais uma vez."""
        import psycopg2
        from psycopg2.extras import RealDictCursor
        for attempt in (1, 2):
            pool = self._get_pool()
            conn = pool.getconn()
            broken = False
            try:
                with conn:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        return fn(cur)
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                broken = True
                if attempt == 2:
                    raise
                log.warning("Conexão com o banco perdida; reconectando...")
            finally:
                pool.putconn(conn, close=broken)

    def insert_many(self, items: List[TelemetryIn]) -> Tuple[int, int]:
        def work(cur):
            inserted = 0
            for t in items:
                raw = t.model_dump(mode="json")
                cur.execute(INSERT_SQL, (
                    t.timestamp, t.machine_state, t.belt_speed,
                    t.buttons.start_pressed, t.buttons.stop_pressed,
                    t.buttons.emergency_pressed, t.buttons.reset_pressed,
                    json.dumps(raw, ensure_ascii=False), t.msg_id))
                if cur.fetchone():
                    inserted += 1
            return inserted
        inserted = self._run(work)
        return inserted, len(items) - inserted

    def latest(self, machine_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        def work(cur):
            if machine_id:
                cur.execute(f"SELECT {SELECT_COLS} FROM telemetry_logs WHERE raw_payload->>'machine_id' = %s "
                            "ORDER BY timestamp DESC LIMIT 1", (machine_id,))
            else:
                cur.execute(f"SELECT {SELECT_COLS} FROM telemetry_logs ORDER BY timestamp DESC LIMIT 1")
            return cur.fetchone()
        return self._run(work)

    def history(self, minutes: int, limit: int) -> List[Dict[str, Any]]:
        def work(cur):
            cur.execute(f"SELECT {SELECT_COLS} FROM telemetry_logs WHERE timestamp >= NOW() - %s::interval "
                        "ORDER BY timestamp DESC LIMIT %s", (f"{minutes} minutes", limit))
            return cur.fetchall()
        return self._run(work)

    def ping(self) -> bool:
        return self._run(lambda cur: (cur.execute("SELECT 1 AS ok"), cur.fetchone())[1]["ok"] == 1)


def ingest(repo, items: List[TelemetryIn]) -> IngestResult:
    """Ponto ÚNICO de gravação (usado pelo HTTP e pelo assinante MQTT)."""
    if not items:
        return IngestResult(received=0, inserted=0, duplicates=0)
    inserted, dup = repo.insert_many(items)
    if dup:
        log.info("Ignoradas %d mensagens duplicadas (reenvio pós-reconexão)", dup)
    return IngestResult(received=len(items), inserted=inserted, duplicates=dup)


# =============================================================================
# ASSINANTE MQTT (HiveMQ Cloud -> banco)
# =============================================================================
class MqttBridge:
    """Sessão persistente (clean_session=False + QoS 1): se o iot-service cair, o HiveMQ
    guarda as mensagens e entrega quando ele voltar."""

    def __init__(self, repo):
        self.repo = repo
        self.client = None
        self.connected = False

    def start(self):
        import paho.mqtt.client as mqtt
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=MQTT_CLIENT_ID,
                                  clean_session=False, protocol=mqtt.MQTTv311)
        if MQTT_USER:
            self.client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        if MQTT_TLS:
            self.client.tls_set(cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        self.client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=30)
        self.client.loop_start()
        log.info("Assinante MQTT iniciado -> %s:%s (TLS=%s)", MQTT_HOST, MQTT_PORT, MQTT_TLS)

    def stop(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

    def publish(self, topic: str, payload: Dict[str, Any]) -> bool:
        if not (self.client and self.connected):
            return False
        info = self.client.publish(topic, json.dumps(payload), qos=1)
        return info.rc == 0

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self.connected = True
            client.subscribe(MQTT_TOPIC_DATA, qos=1)
            log.info("MQTT conectado; inscrito em %s", MQTT_TOPIC_DATA)
        else:
            log.error("Falha na conexão MQTT: %s", reason_code)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.connected = False
        log.warning("MQTT desconectado (%s). Reconectando automaticamente...", reason_code)

    def _on_message(self, client, userdata, msg):
        try:
            item = TelemetryIn.model_validate(json.loads(msg.payload))
        except (ValueError, ValidationError) as e:
            log.warning("Mensagem inválida descartada em %s: %s", msg.topic, str(e)[:300])
            return
        try:
            ingest(self.repo, [item])
        except Exception:
            log.exception("Erro ao gravar telemetria %s", item.msg_id)


# =============================================================================
# SEGURANÇA (JWT emitido pelo Grupo 5 + API key da borda)
# =============================================================================
def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not AUTH_ENABLED:
        return {"sub": "dev-local", "role": "ADMIN"}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token JWT ausente",
                            headers={"WWW-Authenticate": "Bearer"})
    if not JWT_SECRET:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "JWT_SECRET não configurado")
    try:
        return jwt.decode(authorization[7:].strip(), JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expirado", headers={"WWW-Authenticate": "Bearer"})
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido", headers={"WWW-Authenticate": "Bearer"})


def require_roles(allowed: set):
    def checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Perfil '{user.get('role')}' sem permissão")
        return user
    return checker


def require_ingest_key(x_api_key: Optional[str] = Header(None)) -> None:
    if not AUTH_ENABLED:
        return
    if not INGEST_API_KEY:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "INGEST_API_KEY não configurada")
    if not x_api_key or not secrets.compare_digest(x_api_key, INGEST_API_KEY):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-API-Key inválida")


# =============================================================================
# APLICAÇÃO
# =============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    if getattr(app.state, "repo", None) is None:      # testes podem injetar um repositório falso
        app.state.repo = PostgresRepository(DATABASE_URL)
    app.state.mqtt = None
    if MQTT_SUBSCRIBE:
        if not MQTT_HOST:
            log.error("MQTT_SUBSCRIBE=true, mas MQTT_HOST está vazio")
        else:
            app.state.mqtt = MqttBridge(app.state.repo)
            app.state.mqtt.start()
    yield
    if app.state.mqtt:
        app.state.mqtt.stop()


app = FastAPI(title="iot-service — Telemetria SMART 4.0 (Grupo 1)", version="0.1.0-sprint1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type", "X-API-Key"])


def get_repo(request: Request):
    return request.app.state.repo


def _to_status(row: Dict[str, Any]) -> Dict[str, Any]:
    raw = row.get("raw_payload") or {}
    if isinstance(raw, str):
        raw = json.loads(raw)
    ts: datetime = row["timestamp"]
    age = (datetime.now(timezone.utc) - ts).total_seconds()
    speed = float(row["belt_speed"]) if row.get("belt_speed") is not None else None
    state = row["machine_state"]
    return {
        "timestamp": ts.isoformat(),
        "machine_id": raw.get("machine_id"),
        "machine_state": state,                                           # ENUM do banco
        "system_status": "EMERGENCY_STOP" if state == "EMERGENCY" else state,  # enum do openapi-spec.yaml
        "edge_online": age <= EDGE_STALE_SECONDS,                         # p/ Grupo 4 exibir DESCONECTADO
        "age_seconds": round(age, 1),
        "buttons": {
            "start_pressed": row["start_button_pressed"],
            "stop_pressed": row["stop_button_pressed"],
            "emergency_active": row["emergency_pressed"],
            "reset_pressed": row["reset_pressed"],
        },
        "conveyor_speed_m_s": speed,
        "belt_running": raw.get("belt_running"),
        "stations": raw.get("stations"),
        # --- compatibilidade com test_integration.py do professor (remover após unificar o contrato) ---
        "start_button": row["start_button_pressed"],
        "emergency_button": row["emergency_pressed"],
        "conveyor_speed": speed,
    }


@app.get("/health", tags=["infra"])
def health(request: Request):
    db_ok = True
    try:
        request.app.state.repo.ping()
    except Exception as e:
        db_ok = False
        log.error("Health: banco indisponível: %s", e)
    mqtt = request.app.state.mqtt
    body = {"status": "ok" if db_ok else "degraded", "database": db_ok,
            "mqtt_subscriber": None if mqtt is None else mqtt.connected}
    if not db_ok:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, body)
    return body


@app.post("/api/v1/telemetry/ingest", response_model=IngestResult, tags=["Grupo 1: Telemetria & CLP"],
          dependencies=[Depends(require_ingest_key)])
def ingest_http(payload: Union[TelemetryIn, List[TelemetryIn]] = Body(...), repo=Depends(get_repo)):
    items = payload if isinstance(payload, list) else [payload]
    if len(items) > 500:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Máximo de 500 mensagens por lote")
    return ingest(repo, items)


@app.get("/api/v1/telemetry/status", tags=["Grupo 1: Telemetria & CLP"])
def telemetry_status(machine_id: Optional[str] = Query(None), repo=Depends(get_repo),
                     user=Depends(require_roles(ROLES_READ))):
    row = repo.latest(machine_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nenhuma telemetria registrada ainda")
    return _to_status(row)


@app.get("/api/v1/telemetry/history", tags=["Grupo 1: Telemetria & CLP"])
def telemetry_history(minutes: int = Query(60, ge=1, le=10080), limit: int = Query(500, ge=1, le=5000),
                      repo=Depends(get_repo), user=Depends(require_roles(ROLES_READ))):
    rows = repo.history(minutes, limit)
    return {"count": len(rows), "items": [_to_status(r) for r in rows]}


@app.post("/api/v1/telemetry/commands", status_code=status.HTTP_202_ACCEPTED, tags=["Grupo 1: Telemetria & CLP"])
def telemetry_command(cmd: MachineCommand, request: Request, user=Depends(require_roles(ROLES_COMMAND))):
    """SPRINT 1: apenas valida, registra e publica no tópico de comandos.
    A execução no CLP será feita na Sprint 3. Um comando web NUNCA substitui a
    emergência física, que atua direto no hardware."""
    command = "EMERGENCY" if cmd.command == "EMERGENCY_STOP" else cmd.command
    envelope = {
        "command_id": str(uuid.uuid4()),
        "command": command,
        "parameters": cmd.parameters or {},
        "requested_by": user.get("sub"),
        "role": user.get("role"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    mqtt = request.app.state.mqtt
    delivered = mqtt.publish(MQTT_TOPIC_COMMANDS, envelope) if mqtt else False
    log.info("Comando %s solicitado por %s (%s) - publicado=%s", command, user.get("sub"), user.get("role"), delivered)
    return {"status": "ACCEPTED", **envelope, "delivered_to_broker": delivered,
            "note": "Sprint 1: comando registrado; execução no CLP prevista para a Sprint 3."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
