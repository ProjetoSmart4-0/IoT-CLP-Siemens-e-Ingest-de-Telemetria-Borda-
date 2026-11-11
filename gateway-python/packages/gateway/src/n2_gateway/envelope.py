"""Montagem do envelope v1 (packages/shared/schema/envelope.v1.schema.json).

Substitui o normalize.py do esqueleto do monorepo, corrigindo:
- message_id colidia após reinício do gateway (seq voltava a 0 com o mesmo stream_id).
  Agora o stream_id inclui um boot_id, e seq é monotônico dentro do stream.
- quality era sempre GOOD; agora vem do StatusCode OPC UA / estado da conexão.
- gateway_utc tinha resolução de segundos; agora é ISO-8601 UTC com milissegundos e sufixo Z.
- origin é parâmetro de configuração: dado de mock é "simulado", nunca "medido".
"""
from __future__ import annotations

import itertools
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

SCHEMA_VERSION = "1.0"


def utc_iso(dt: datetime | None = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    if dt.tzinfo is None:  # asyncua devolve SourceTimestamp sem tzinfo, mas em UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def map_quality(status_name: str | None, reason: str | None = None) -> dict:
    """Traduz o StatusCode OPC UA (ex.: 'Good', 'BadNodeIdUnknown') para GOOD/UNCERTAIN/BAD."""
    name = status_name or "Good"
    if name.startswith("Good"):
        status = "GOOD"
    elif name.startswith("Uncertain"):
        status = "UNCERTAIN"
    else:
        status = "BAD"
    return {"status": status, "source_code": name, "reason": reason}


class Stream:
    """Fluxo de mensagens de uma fonte (plc, ur, gateway) com seq monotônico e thread-safe."""

    def __init__(self, asset_id: str, source: str, boot_id: str | None = None):
        self.boot_id = boot_id or f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
        self.id = f"{asset_id}:{source}:{self.boot_id}"
        self._counter = itertools.count()
        self._lock = threading.Lock()

    def next_seq(self) -> int:
        with self._lock:
            return next(self._counter)


class EnvelopeFactory:
    def __init__(self, unit_id: str, asset_id: str, origin: str, map_version: str):
        self.unit_id = unit_id
        self.asset_id = asset_id
        self.origin = origin
        self.map_version = map_version

    def build(
        self,
        stream: Stream,
        tag: str,
        value: Any,
        value_type: str,
        unit: str | None,
        *,
        component_id: str | None = None,
        source_utc: str | None = None,
        source_uptime_s: float | None = None,
        quality: dict | None = None,
        origin: str | None = None,
        context: dict | None = None,
    ) -> dict:
        seq = stream.next_seq()
        ctx = {"map_version": self.map_version}
        if component_id:
            ctx["component_id"] = component_id
        if context:
            ctx.update(context)
        return {
            "schema_version": SCHEMA_VERSION,
            "message_id": f"{stream.id}:{seq}",
            "unit_id": self.unit_id,
            "asset_id": self.asset_id,
            "tag": tag,
            "value": value,
            "value_type": value_type,
            "unit": unit,
            "origin": origin or self.origin,
            "timestamps": {
                "source_utc": source_utc,
                "gateway_utc": utc_iso(),
                "ingest_utc": None,   # preenchido pelo backend
                "emitted_utc": None,  # preenchido por quem retransmite ao front
                "source_uptime_s": source_uptime_s,
            },
            "quality": quality or map_quality("Good"),
            "stream_id": stream.id,
            "seq": seq,
            "context": ctx,
        }
