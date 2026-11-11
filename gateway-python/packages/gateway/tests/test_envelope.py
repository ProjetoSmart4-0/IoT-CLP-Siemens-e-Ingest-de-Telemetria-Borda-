import re

import pytest

from n2_gateway.envelope import EnvelopeFactory, Stream, map_quality, utc_iso

ISO_MS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def make():
    return EnvelopeFactory("UNIDADE-SP", "N2-001", "simulado", "mock-1")


def test_envelope_respeita_o_schema(validator):
    env = make().build(Stream("N2-001", "plc"), "machine.state", "executando", "string", None,
                       component_id="plc", source_utc=utc_iso())
    assert validator.errors(env) == []
    assert env["origin"] == "simulado"
    assert ISO_MS.match(env["timestamps"]["gateway_utc"])


def test_vetor_de_juntas_respeita_o_schema(validator):
    env = make().build(Stream("N2-001", "ur"), "robot.joint_position", [0.0] * 6, "float64[6]", "rad")
    assert validator.errors(env) == []


def test_seq_monotonico_e_message_id_unico_entre_reinicios():
    f = make()
    s1, s2 = Stream("N2-001", "plc", boot_id="boot-a"), Stream("N2-001", "plc", boot_id="boot-b")
    a = [f.build(s1, "machine.state", "parada", "string", None) for _ in range(3)]
    b = f.build(s2, "machine.state", "parada", "string", None)  # gateway reiniciado: seq volta a 0
    assert [e["seq"] for e in a] == [0, 1, 2]
    assert b["seq"] == 0
    assert b["message_id"] != a[0]["message_id"]  # o esqueleto antigo colidia aqui
    assert b["stream_id"] != a[0]["stream_id"]


@pytest.mark.parametrize("name,expected", [
    ("Good", "GOOD"), ("GoodClamped", "GOOD"), ("UncertainLastUsableValue", "UNCERTAIN"),
    ("BadNodeIdUnknown", "BAD"), ("BadNotConnected", "BAD"), (None, "GOOD"),
])
def test_mapeamento_de_qualidade(name, expected):
    assert map_quality(name)["status"] == expected


def test_envelope_invalido_e_detectado(validator):
    env = make().build(Stream("N2-001", "plc"), "machine.state", "x", "string", None)
    env["origin"] = "inventado"
    env["tag"] = "MachineState"
    errs = validator.errors(env)
    assert any("origin" in e for e in errs) and any("tag" in e for e in errs)
