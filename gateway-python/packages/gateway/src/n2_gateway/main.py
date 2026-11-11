"""Pipeline do gateway: OPC UA (CLP) + UR -> envelope v1 -> validação -> buffer -> MQTT."""
from __future__ import annotations

import asyncio
import json
import logging
import signal

from .buffer import Buffer
from .config import Config
from .envelope import EnvelopeFactory, Stream
from .publisher import MqttPublisher, topic_for
from .sources.opcua_source import OpcUaSource
from .sources.ur_source import UrSource
from .tagmap import load_tags
from .validator import EnvelopeValidator

log = logging.getLogger("n2.gateway")


class Gateway:
    def __init__(self, cfg: Config, publisher_cls=MqttPublisher):
        self.cfg = cfg
        self.validator = EnvelopeValidator(cfg.schema_path)
        self.factory = EnvelopeFactory(cfg.unit_id, cfg.asset_id, cfg.origin, cfg.tagmap.get("map_version", "sem-versao"))
        self.buffer = Buffer(cfg.buffer_path, cfg.buffer_max)
        self.publisher = publisher_cls(cfg, self.buffer)
        self.rejected = 0
        self.plc = OpcUaSource(cfg, load_tags(cfg.tagmap), self.factory, self.emit)
        self.ur = UrSource(cfg, self.factory, self.emit) if cfg.ur_host else None
        self.gw_stream = Stream(cfg.asset_id, "gateway")

    def emit(self, env: dict) -> None:
        errs = self.validator.errors(env)
        if errs:  # nunca publica fora do contrato; registra e conta
            self.rejected += 1
            log.error("Envelope rejeitado (%s): %s", env.get("tag"), errs)
            return
        topic = topic_for(self.cfg.topic_prefix, self.cfg.unit_id, self.cfg.asset_id, env["tag"])
        self.publisher.enqueue(topic, json.dumps(env, separators=(",", ":"), ensure_ascii=False))

    async def heartbeat(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            self.emit(self.factory.build(
                self.gw_stream, "gateway.status", "online", "string", None,
                component_id="gateway", origin="calculado",
                context={
                    "plc_connected": self.plc.connected,
                    "mqtt_connected": self.publisher.connected,
                    "buffer_pending": len(self.buffer),
                    "buffer_dropped": self.buffer.dropped,
                    "rejected": self.rejected,
                    "data_origin": self.cfg.origin,
                }))
            try:
                await asyncio.wait_for(stop.wait(), timeout=self.cfg.heartbeat_s)
            except asyncio.TimeoutError:
                pass

    async def run(self, stop: asyncio.Event) -> None:
        self.publisher.start()
        tasks = [self.plc.run(stop), self.publisher.run(stop), self.heartbeat(stop)]
        if self.ur:
            tasks.append(self.ur.run(stop))
        try:
            await asyncio.gather(*tasks)
        finally:
            self.publisher.stop()
            self.buffer.close()


async def _main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = Config.from_env()
    log.info("Gateway %s/%s origin=%s opcua=%s ur=%s mqtt=%s",
             cfg.unit_id, cfg.asset_id, cfg.origin, cfg.opcua_endpoint, cfg.ur_host, cfg.mqtt_url)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass
    await Gateway(cfg).run(stop)


def run() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    run()
