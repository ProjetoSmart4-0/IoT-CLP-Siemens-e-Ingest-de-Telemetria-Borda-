"""Configuração por variável de ambiente.

Regra do projeto: nenhum endereço industrial (IP, NodeId, DB) fica no código.
Endereços ficam no mapa de tags (config/tagmap.*.json); credenciais só em variável de ambiente.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

ORIGINS = ("medido", "calculado", "simulado")


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _bool(name: str, default: bool) -> bool:
    value = _env(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "sim", "on")


@dataclass(frozen=True)
class Config:
    unit_id: str = "UNIDADE-XX"
    asset_id: str = "N2-001"
    origin: str = "medido"  # "simulado" quando a fonte é mock

    opcua_endpoint: str = "opc.tcp://localhost:4840/n2/mock"
    opcua_user: str | None = None
    opcua_password: str | None = None
    opcua_sampling_ms: int = 100  # leitura de 100 ms (item 2 da Sprint 1)

    ur_host: str | None = None
    ur_port: int = 30004
    ur_decimation: int = 1  # publica 1 a cada N pacotes do robô

    mqtt_url: str = "mqtt://localhost:1883"
    mqtt_user: str | None = None
    mqtt_password: str | None = None
    mqtt_client_id: str = "n2-gateway"
    topic_prefix: str = "n2/v1"

    buffer_path: str = "buffer.sqlite"
    buffer_max: int = 100_000
    heartbeat_s: float = 5.0

    tagmap_path: str = "config/tagmap.mock.json"
    schema_path: str = "../shared/schema/envelope.v1.schema.json"
    tagmap: dict = field(default_factory=dict)

    @staticmethod
    def from_env() -> "Config":
        origin = _env("ORIGIN", "medido")
        if origin not in ORIGINS:
            raise ValueError(f"ORIGIN inválida: {origin} (use {ORIGINS})")
        tagmap_path = _env("TAGMAP_PATH", "config/tagmap.mock.json")
        tagmap = json.loads(Path(tagmap_path).read_text(encoding="utf-8"))
        return Config(
            unit_id=_env("UNIT_ID", "UNIDADE-XX"),
            asset_id=_env("ASSET_ID", "N2-001"),
            origin=origin,
            opcua_endpoint=_env("OPCUA_ENDPOINT", "opc.tcp://localhost:4840/n2/mock"),
            opcua_user=_env("OPCUA_USER"),
            opcua_password=_env("OPCUA_PASSWORD"),
            opcua_sampling_ms=int(_env("OPCUA_SAMPLING_MS", "100")),
            ur_host=_env("UR_HOST"),
            ur_port=int(_env("UR_PORT", "30004")),
            ur_decimation=max(1, int(_env("UR_DECIMATION", "1"))),
            mqtt_url=_env("MQTT_URL", "mqtt://localhost:1883"),
            mqtt_user=_env("MQTT_USER"),
            mqtt_password=_env("MQTT_PASSWORD"),
            mqtt_client_id=_env("MQTT_CLIENT_ID", "n2-gateway"),
            topic_prefix=_env("TOPIC_PREFIX", "n2/v1"),
            buffer_path=_env("BUFFER_PATH", "buffer.sqlite"),
            buffer_max=int(_env("BUFFER_MAX", "100000")),
            heartbeat_s=float(_env("HEARTBEAT_S", "5")),
            tagmap_path=tagmap_path,
            schema_path=_env("SCHEMA_PATH", "../shared/schema/envelope.v1.schema.json"),
            tagmap=tagmap,
        )
