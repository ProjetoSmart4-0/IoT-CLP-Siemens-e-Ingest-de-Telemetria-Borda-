"""Publicação MQTT (QoS 1) com birth/last-will e descarga ordenada do buffer."""
from __future__ import annotations

import asyncio
import json
import logging
import ssl
from typing import Callable
from urllib.parse import urlparse

import paho.mqtt.client as mqtt

from .buffer import Buffer, Item

log = logging.getLogger("n2.publisher")


def topic_for(prefix: str, unit_id: str, asset_id: str, tag: str) -> str:
    """machine.state -> n2/v1/UNIDADE-SP/N2-001/machine/state"""
    return f"{prefix}/{unit_id}/{asset_id}/{tag.replace('.', '/')}"


def status_topic(prefix: str, unit_id: str, asset_id: str) -> str:
    return f"{prefix}/{unit_id}/{asset_id}/_status"


def mark_buffered(item: Item) -> str:
    """Mensagem gravada com o broker fora do ar sai com context.buffered = true."""
    if not item.offline:
        return item.payload
    env = json.loads(item.payload)
    env.setdefault("context", {})["buffered"] = True
    return json.dumps(env, separators=(",", ":"), ensure_ascii=False)


async def drain(buffer: Buffer, publish: Callable[[Item, str], bool], batch: int = 100) -> int:
    """Envia em ordem; para no primeiro erro (preserva a ordem). Retorna quantas saíram."""
    sent = 0
    for item in buffer.peek(batch):
        ok = await asyncio.to_thread(publish, item, mark_buffered(item))
        if not ok:
            break
        buffer.ack(item.id)
        sent += 1
    return sent


class MqttPublisher:
    def __init__(self, cfg, buffer: Buffer):
        self.cfg = cfg
        self.buffer = buffer
        self.connected = False
        self.status_topic = status_topic(cfg.topic_prefix, cfg.unit_id, cfg.asset_id)
        url = urlparse(cfg.mqtt_url)
        self.host = url.hostname or "localhost"
        self.port = url.port or (8883 if url.scheme == "mqtts" else 1883)

        c = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=cfg.mqtt_client_id,
            clean_session=False,  # sessão persistente no broker
        )
        if url.scheme == "mqtts":
            c.tls_set(cert_reqs=ssl.CERT_REQUIRED)
        if cfg.mqtt_user:
            c.username_pw_set(cfg.mqtt_user, cfg.mqtt_password)
        c.will_set(self.status_topic, self._status_payload("OFFLINE"), qos=1, retain=True)
        c.reconnect_delay_set(min_delay=1, max_delay=30)
        c.on_connect = self._on_connect
        c.on_disconnect = self._on_disconnect
        self.client = c

    def _status_payload(self, status: str) -> str:
        return json.dumps({"status": status, "unit_id": self.cfg.unit_id, "asset_id": self.cfg.asset_id})

    def _on_connect(self, client, _userdata, _flags, reason_code, _props):
        if reason_code.is_failure:
            log.warning("MQTT recusou a conexão: %s", reason_code)
            return
        self.connected = True
        client.publish(self.status_topic, self._status_payload("ONLINE"), qos=1, retain=True)
        log.info("MQTT conectado em %s:%s", self.host, self.port)

    def _on_disconnect(self, _client, _userdata, _flags, reason_code, _props):
        self.connected = False
        log.warning("MQTT desconectado (%s); mensagens seguem no buffer", reason_code)

    def start(self) -> None:
        self.client.connect_async(self.host, self.port, keepalive=30)
        self.client.loop_start()  # thread do paho cuida da reconexão

    def stop(self) -> None:
        try:
            self.client.publish(self.status_topic, self._status_payload("OFFLINE"), qos=1, retain=True)
            self.client.disconnect()
        finally:
            self.client.loop_stop()

    def enqueue(self, topic: str, payload: str) -> None:
        self.buffer.put(topic, payload, qos=1, offline=not self.connected)

    def _publish(self, item: Item, payload: str) -> bool:
        if not self.connected:
            return False
        info = self.client.publish(item.topic, payload, qos=item.qos, retain=item.retain)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            return False
        try:
            info.wait_for_publish(timeout=5)  # espera o PUBACK
        except (RuntimeError, ValueError):
            return False
        return info.is_published()

    async def run(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            sent = await drain(self.buffer, self._publish) if self.connected else 0
            if sent == 0:
                await asyncio.sleep(0.05 if self.connected else 0.5)
