"""Integração com os mocks reais do monorepo (sem Docker): CLP OPC UA e UR3e."""
import asyncio
import json

import mock_plc
import mock_ur

from conftest import free_port
from n2_gateway.envelope import EnvelopeFactory
from n2_gateway.sources.opcua_source import OpcUaSource
from n2_gateway.sources.ur_source import UrSource
from n2_gateway.tagmap import load_tags


async def test_opcua_le_mock_e_marca_bad_quando_cai(cfg_factory, mock_tagmap, validator):
    port = free_port()
    cfg = cfg_factory(opcua_endpoint=f"opc.tcp://127.0.0.1:{port}/n2/mock")
    ready, plc_stop, gw_stop = asyncio.Event(), asyncio.Event(), asyncio.Event()
    plc = asyncio.create_task(mock_plc.serve(cfg.opcua_endpoint, 0.3, ready, plc_stop))
    await asyncio.wait_for(ready.wait(), 10)

    got = []
    src = OpcUaSource(cfg, load_tags(mock_tagmap), EnvelopeFactory("UNIDADE-SP", "N2-001", "simulado", "mock-1"), got.append)
    gw = asyncio.create_task(src.run(gw_stop))
    await asyncio.sleep(2.5)

    states = [e for e in got if e["tag"] == "machine.state"]
    assert len(states) >= 3, "deveria receber várias mudanças de estado"
    assert all(validator.errors(e) == [] for e in got)
    assert {e["value"] for e in states} <= {"parada", "pronta", "executando", "alarme"}
    assert all(e["quality"]["status"] == "GOOD" and e["timestamps"]["source_utc"] for e in states)
    seqs = [e["seq"] for e in got]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)

    # derruba o CLP: o gateway deve publicar BAD em vez de congelar o último valor
    plc_stop.set()
    await asyncio.wait_for(plc, 10)
    for _ in range(40):
        if any(e["quality"]["status"] == "BAD" for e in got):
            break
        await asyncio.sleep(0.25)
    bad = [e for e in got if e["quality"]["status"] == "BAD"]
    assert bad and all(e["value"] is None for e in bad)
    assert all(validator.errors(e) == [] for e in bad)
    gw_stop.set()
    await asyncio.wait_for(gw, 10)


async def test_ur_le_mock(cfg_factory, validator):
    port = free_port()
    server = await asyncio.start_server(mock_ur.handle, "127.0.0.1", port)
    cfg = cfg_factory(ur_host="127.0.0.1", ur_port=port, ur_decimation=2)
    got, stop = [], asyncio.Event()
    src = UrSource(cfg, EnvelopeFactory("UNIDADE-SP", "N2-001", "simulado", "mock-1"), got.append)
    task = asyncio.create_task(src.run(stop))
    await asyncio.sleep(1.2)
    stop.set()
    await asyncio.wait_for(task, 5)
    server.close()

    joints = [e for e in got if e["tag"] == "robot.joint_position"]
    assert 3 <= len(joints) <= 8  # ~11 pacotes, decimação 2
    assert all(len(e["value"]) == 6 and e["unit"] == "rad" for e in joints)
    assert all(e["timestamps"]["source_uptime_s"] is not None for e in joints)
    assert [e["value"] for e in got if e["tag"] == "robot.runtime_state"][:1] == ["executando"]
    assert all(validator.errors(e) == [] for e in got)


async def test_ur_indisponivel_publica_bad(cfg_factory, validator):
    cfg = cfg_factory(ur_host="127.0.0.1", ur_port=free_port())
    got, stop = [], asyncio.Event()
    task = asyncio.create_task(UrSource(cfg, EnvelopeFactory("U", "A", "simulado", "m"), got.append).run(stop))
    await asyncio.sleep(0.5)
    stop.set()
    await asyncio.wait_for(task, 5)
    assert got and got[0]["quality"]["status"] == "BAD" and validator.errors(got[0]) == []


class FakePublisher:
    def __init__(self, cfg, buffer):
        self.buffer, self.connected = buffer, False
    def start(self): pass
    def stop(self): pass
    def enqueue(self, topic, payload):
        self.buffer.put(topic, payload, offline=not self.connected)
    async def run(self, stop):
        await stop.wait()


async def test_gateway_completo_ate_o_buffer(cfg_factory):
    from n2_gateway.main import Gateway
    port = free_port()
    ready, stop = asyncio.Event(), asyncio.Event()
    plc = asyncio.create_task(mock_plc.serve(f"opc.tcp://127.0.0.1:{port}/n2/mock", 0.3, ready, stop))
    await asyncio.wait_for(ready.wait(), 10)
    gw = Gateway(cfg_factory(opcua_endpoint=f"opc.tcp://127.0.0.1:{port}/n2/mock"), publisher_cls=FakePublisher)
    buf = gw.buffer
    task = asyncio.create_task(gw.run(stop))
    await asyncio.sleep(1.5)
    items = buf.peek(1000)
    topics = {i.topic for i in items}
    assert "n2/v1/UNIDADE-SP/N2-001/machine/state" in topics
    assert "n2/v1/UNIDADE-SP/N2-001/gateway/status" in topics
    hb = [json.loads(i.payload) for i in items if i.topic.endswith("gateway/status")]
    assert hb[-1]["origin"] == "calculado" and hb[-1]["context"]["data_origin"] == "simulado"
    assert all(i.offline for i in items)  # broker "fora": tudo fica retido
    assert gw.rejected == 0
    stop.set()
    await asyncio.wait_for(asyncio.gather(task, plc), 10)
