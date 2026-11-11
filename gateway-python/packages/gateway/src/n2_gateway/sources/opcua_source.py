"""Leitura do CLP via OPC UA — SOMENTE LEITURA.

Este módulo não chama write_value/write_attribute/call_method em nenhum ponto
(há um teste que garante isso). Comandos remotos ficam fora do escopo (D-G1-06).

- Subscrição com amostragem de 100 ms; o servidor só notifica mudanças (substitui o polling).
- Reconexão com backoff exponencial (2 s .. 60 s).
- Ao perder a sessão, publica o último valor de cada tag com quality BAD,
  para o gêmeo digital mostrar "sem dado" em vez de congelar o último estado.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Callable

from asyncua import Client, ua

from ..envelope import EnvelopeFactory, Stream, map_quality, utc_iso
from ..tagmap import TagDef

log = logging.getLogger("n2.opcua")

Emit = Callable[[dict], None]


class _Handler:
    def __init__(self, source: "OpcUaSource"):
        self.src = source

    def datachange_notification(self, node, val, data):
        tag = self.src.by_node.get(node.nodeid.to_string())
        if tag is None:
            return
        dv = data.monitored_item.Value
        self.src.emit_value(tag, val, dv.StatusCode, dv.SourceTimestamp)

    def status_change_notification(self, status):
        log.warning("Subscrição mudou de status: %s", status)
        self.src.lost.set()


class OpcUaSource:
    def __init__(self, cfg, tags: list[TagDef], factory: EnvelopeFactory, emit: Emit, stream: Stream | None = None):
        self.cfg = cfg
        self.tags = tags
        self.factory = factory
        self.emit = emit
        self.stream = stream or Stream(cfg.asset_id, "plc")
        self.by_node: dict[str, TagDef] = {}
        self.last: dict[str, tuple] = {}
        self.lost = asyncio.Event()
        self.connected = False

    def emit_value(self, tag: TagDef, raw, status_code, source_ts) -> None:
        status_name = status_code.name if status_code is not None else "Good"
        good = status_name.startswith("Good")
        value = tag.convert(raw) if good else None
        self.last[tag.tag] = (value,)
        self.emit(
            self.factory.build(
                self.stream, tag.tag, value, tag.value_type, tag.unit,
                component_id=tag.component_id,
                source_utc=utc_iso(source_ts) if source_ts else None,
                quality=map_quality(status_name),
                context={"raw_value": raw} if tag.enum and good else None,
            )
        )

    def emit_lost(self, reason: str) -> None:
        for tag in self.tags:
            self.emit(
                self.factory.build(
                    self.stream, tag.tag, None, tag.value_type, tag.unit,
                    component_id=tag.component_id,
                    quality={"status": "BAD", "source_code": "BadNotConnected", "reason": reason},
                )
            )

    async def _resolve(self, client: Client, tag: TagDef):
        node = tag.node
        if "node_id" in node:
            return client.get_node(node["node_id"])
        ns = await client.get_namespace_index(node["ns_uri"])
        path = ["0:Objects"] + [f"{ns}:{p}" for p in node["browse_path"]]
        return await client.nodes.root.get_child(path)

    async def _session(self) -> None:
        client = Client(url=self.cfg.opcua_endpoint, timeout=4)
        if self.cfg.opcua_user:
            client.set_user(self.cfg.opcua_user)
            client.set_password(self.cfg.opcua_password or "")
        async with client:
            self.connected = True
            self.lost.clear()
            nodes = []
            for tag in self.tags:
                n = await self._resolve(client, tag)
                self.by_node[n.nodeid.to_string()] = tag
                nodes.append(n)
            sub = await client.create_subscription(self.cfg.opcua_sampling_ms, _Handler(self))
            # subscribe_data_change já entrega o valor inicial de cada tag
            await sub.subscribe_data_change(nodes, sampling_interval=self.cfg.opcua_sampling_ms)
            log.info("OPC UA: %d tags monitoradas em %s", len(nodes), self.cfg.opcua_endpoint)
            while not self.lost.is_set():
                await asyncio.sleep(1)
                await client.check_connection()  # levanta exceção se a sessão caiu

    async def run(self, stop: asyncio.Event) -> None:
        attempt = 0
        while not stop.is_set():
            try:
                task = asyncio.create_task(self._session())
                stopper = asyncio.create_task(stop.wait())
                done, _ = await asyncio.wait({task, stopper}, return_when=asyncio.FIRST_COMPLETED)
                if stopper in done:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                    return
                stopper.cancel()
                task.result()
                attempt = 0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — qualquer falha vira reconexão
                if self.connected:
                    self.emit_lost(f"sessão OPC UA perdida: {type(exc).__name__}")
                self.connected = False
                delay = min(2 * 2 ** attempt, 60)
                attempt += 1
                log.warning("OPC UA indisponível (%s); nova tentativa em %ss", exc, delay)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=delay)
                except asyncio.TimeoutError:
                    pass
