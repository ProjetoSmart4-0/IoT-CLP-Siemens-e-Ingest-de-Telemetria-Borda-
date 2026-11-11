import json
import socket
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]          # raiz do monorepo
GATEWAY = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "packages/shared/schema/envelope.v1.schema.json"
sys.path.insert(0, str(ROOT / "docker/mock-plc"))
sys.path.insert(0, str(ROOT / "docker/mock-ur"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def validator():
    from n2_gateway.validator import EnvelopeValidator
    return EnvelopeValidator(SCHEMA)


@pytest.fixture
def mock_tagmap():
    return json.loads((GATEWAY / "config/tagmap.mock.json").read_text(encoding="utf-8"))


@pytest.fixture
def cfg_factory(tmp_path, mock_tagmap):
    from n2_gateway.config import Config

    def make(**kw):
        base = dict(unit_id="UNIDADE-SP", asset_id="N2-001", origin="simulado",
                    buffer_path=str(tmp_path / "buf.sqlite"), schema_path=str(SCHEMA),
                    tagmap=mock_tagmap, heartbeat_s=0.2)
        base.update(kw)
        return Config(**base)
    return make
