"""Ponta a ponta com broker MQTT real (amqtt, em processo): CLP mock -> gateway -> broker -> assinante.

Derruba o broker no meio e confere que nada se perde: o buffer guarda, reenvia em ordem
e marca context.buffered = true. Pulado se o amqtt não estiver instalado (pip install amqtt).
"""
import asyncio
import json
from collections import defaultdict

import paho.mqtt.client as mqtt
import pytest

amqtt_broker = pytest.importorskip("amqtt.broker")
import mock_plc  # noqa: E402

from conftest import free_port  # noqa: E402
from n2_gateway.main import Gateway  # noqa: E402


def broker_cfg(port):
    return {"listeners": {"default": {"type": "tcp", "bind": f"127.0.0.1:{port}"}},
            "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}}}


async def shutdown(broker):
    """O amqtt às vezes não encerra sessões pendentes; não deixa o teste travar por isso."""
    try:
        await asyncio.wait_for(broker.shutdown(), 5)
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        pass


def subscriber(port, sink):
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"teste-{port}-{len(sink)}")
    c.on_connect = lambda cl, *_: cl.subscribe("n2/v1/#", qos=1)
    c.on_message = lambda _c, _u, m: sink.append((m.topic, m.payload.decode()))
    c.connect("127.0.0.1", port)
    c.loop_start()
    return c


async def test_queda_do_broker_sem_perda(cfg_factory, validator):
    mport, oport = free_port(), free_port()
    broker = amqtt_broker.Broker(broker_cfg(mport))
    await broker.start()
    ready, stop = asyncio.Event(), asyncio.Event()
    plc = asyncio.create_task(mock_plc.serve(f"opc.tcp://127.0.0.1:{oport}/n2/mock", 0.25, ready, stop))
    await asyncio.wait_for(ready.wait(), 10)

    got = []
    sub = subscriber(mport, got)
    cfg = cfg_factory(opcua_endpoint=f"opc.tcp://127.0.0.1:{oport}/n2/mock",
                      mqtt_url=f"mqtt://127.0.0.1:{mport}", mqtt_client_id=f"gw-{mport}")
    gw = Gateway(cfg)
    task = asyncio.create_task(gw.run(stop))
    await asyncio.sleep(2.5)
    assert any(t.endswith("machine/state") for t, _ in got), "nada chegou antes da queda"

    # ---- queda do broker ----
    sub.loop_stop(); sub.disconnect()
    await shutdown(broker)
    await asyncio.sleep(2.5)
    assert len(gw.buffer) > 0, "durante a queda as mensagens devem ficar no buffer"
    broker = amqtt_broker.Broker(broker_cfg(mport))
    await broker.start()
    sub = subscriber(mport, got)
    for _ in range(60):
        await asyncio.sleep(0.25)
        if gw.publisher.connected and len(gw.buffer) == 0:
            break
    await asyncio.sleep(1.0)

    stop.set()
    await asyncio.wait_for(asyncio.gather(task, plc), 15)
    sub.loop_stop(); sub.disconnect()
    await shutdown(broker)

    envs = [json.loads(p) for t, p in got if not t.endswith("/_status")]
    assert all(validator.errors(e) == [] for e in envs)
    assert any(e.get("context", {}).get("buffered") for e in envs), "reenvio deve vir marcado"
    by_stream = defaultdict(list)
    for e in envs:
        by_stream[e["stream_id"]].append(e["seq"])
    plc_seqs = next(v for k, v in by_stream.items() if ":plc:" in k)
    # ordem preservada e sem buracos no trecho recebido (QoS 1 pode duplicar: deduplica por seq)
    uniq = sorted(set(plc_seqs))
    assert uniq == list(range(uniq[0], uniq[-1] + 1)), f"buraco na sequência: {uniq}"
    assert plc_seqs == sorted(plc_seqs)
