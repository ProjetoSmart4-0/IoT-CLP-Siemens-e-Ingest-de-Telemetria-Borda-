"""Gera packages/shared/fixtures/gateway-sample.json: envelopes reais do gateway
para o teste de contrato do lado JavaScript (web/backend)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "packages/gateway/src"))

from n2_gateway.envelope import EnvelopeFactory, Stream, map_quality, utc_iso  # noqa: E402
from n2_gateway.validator import EnvelopeValidator  # noqa: E402

f = EnvelopeFactory("UNIDADE-SP", "N2-001", "simulado", "mock-1")
plc, ur, gw = (Stream("N2-001", s, boot_id="fixture") for s in ("plc", "ur", "gateway"))
envs = [
    f.build(plc, "machine.state", "executando", "string", None, component_id="plc",
            source_utc=utc_iso(), context={"raw_value": 2}),
    f.build(plc, "machine.part_present", True, "bool", None, component_id="plc", source_utc=utc_iso()),
    f.build(plc, "machine.state", None, "string", None, component_id="plc",
            quality={"status": "BAD", "source_code": "BadNotConnected", "reason": "sessão OPC UA perdida"}),
    f.build(ur, "robot.joint_position", [0.0, -1.2, 1.4, -1.7, 0.9, 0.0], "float64[6]", "rad",
            component_id="ur3e", source_uptime_s=12.3),
    f.build(ur, "robot.runtime_state", "executando", "string", None, component_id="ur3e",
            quality=map_quality("Good"), context={"raw_value": 2}),
    f.build(gw, "gateway.status", "online", "string", None, component_id="gateway", origin="calculado",
            context={"plc_connected": True, "mqtt_connected": True, "buffer_pending": 0, "buffer_dropped": 0}),
]
v = EnvelopeValidator(ROOT / "packages/shared/schema/envelope.v1.schema.json")
for e in envs:
    v.validate(e)
out = ROOT / "packages/shared/fixtures/gateway-sample.json"
out.write_text(json.dumps(envs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"{len(envs)} envelopes -> {out.relative_to(ROOT)}")
