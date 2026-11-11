"""Leitura do braço UR3e — SOMENTE LEITURA.

Consome o stream do mock (docker/mock-ur): uma linha JSON por pacote, 10 Hz.
O UR real usa RTDE (binário, porta 30004); para a bancada, trocar _read_packets
por um cliente RTDE (ex.: biblioteca ur_rtde) mantendo os mesmos nomes de tag.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

from ..envelope import EnvelopeFactory, Stream, map_quality

log = logging.getLogger("n2.ur")

# runtime_state do RTDE: 0 parado, 1 parando, 2 executando, 3 pausando, 4 pausado, 5 retomando
RUNTIME_STATE = {0: "parado", 1: "parando", 2: "executando", 3: "pausando", 4: "pausado", 5: "retomando"}


class UrSource:
    def __init__(self, cfg, factory: EnvelopeFactory, emit: Callable[[dict], None], stream: Stream | None = None):
        self.cfg = cfg
        self.factory = factory
        self.emit = emit
        self.stream = stream or Stream(cfg.asset_id, "ur")
        self._n = 0
        self._last_state = None

    def handle_packet(self, pkt: dict) -> None:
        uptime = pkt.get("timestamp")
        q = map_quality("Good")
        self._n += 1
        if self._n % self.cfg.ur_decimation == 0:
            self.emit(self.factory.build(
                self.stream, "robot.joint_position", [float(v) for v in pkt["actual_q"]],
                "float64[6]", "rad", component_id="ur3e", source_uptime_s=uptime, quality=q))
            self.emit(self.factory.build(
                self.stream, "robot.tcp_pose", [float(v) for v in pkt["actual_TCP_pose"]],
                "float64[6]", "m|rad", component_id="ur3e", source_uptime_s=uptime, quality=q))
        state = pkt.get("runtime_state")
        if state != self._last_state:  # estado discreto: só na mudança
            self._last_state = state
            self.emit(self.factory.build(
                self.stream, "robot.runtime_state", RUNTIME_STATE.get(state, f"desconhecido_{state}"),
                "string", None, component_id="ur3e", source_uptime_s=uptime, quality=q,
                context={"raw_value": state}))

    async def run(self, stop: asyncio.Event) -> None:
        attempt = 0
        while not stop.is_set():
            writer = None
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(self.cfg.ur_host, self.cfg.ur_port), timeout=4)
                attempt = 0
                log.info("UR conectado em %s:%s", self.cfg.ur_host, self.cfg.ur_port)
                while not stop.is_set():
                    line = await asyncio.wait_for(reader.readline(), timeout=2)
                    if not line:
                        raise ConnectionError("stream do UR encerrado")
                    try:
                        self.handle_packet(json.loads(line))
                    except (ValueError, KeyError, TypeError) as exc:
                        log.warning("Pacote do UR descartado: %s", exc)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self._last_state = None
                self.emit(self.factory.build(
                    self.stream, "robot.runtime_state", None, "string", None, component_id="ur3e",
                    quality={"status": "BAD", "source_code": "BadNotConnected", "reason": str(exc) or type(exc).__name__}))
                delay = min(2 * 2 ** attempt, 30)
                attempt += 1
                log.warning("UR indisponível (%s); nova tentativa em %ss", exc, delay)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=delay)
                except asyncio.TimeoutError:
                    pass
            finally:
                if writer:
                    writer.close()
