import json

import pytest

from conftest import GATEWAY
from n2_gateway.tagmap import load_tags


@pytest.mark.parametrize("name", ["tagmap.mock.json", "tagmap.n2.json"])
def test_mapas_versionados_sao_validos(name):
    tags = load_tags(json.loads((GATEWAY / "config" / name).read_text(encoding="utf-8")))
    assert tags


def test_enum_converte_codigo_em_texto(mock_tagmap):
    state = next(t for t in load_tags(mock_tagmap) if t.tag == "machine.state")
    assert state.convert(2) == "executando"
    assert state.convert(9) == "desconhecido_9"


@pytest.mark.parametrize("bad", ["MachineState", "machine", "machine.state2", "ns=3;s=DB9"])
def test_tag_fora_do_padrao_e_recusada(bad):
    with pytest.raises(ValueError):
        load_tags({"plc_tags": [{"tag": bad, "node": {"node_id": "ns=1;i=1"}, "value_type": "bool"}]})


def test_tag_duplicada_e_recusada():
    item = {"tag": "machine.state", "node": {"node_id": "ns=1;i=1"}, "value_type": "bool"}
    with pytest.raises(ValueError):
        load_tags({"plc_tags": [item, item]})


def test_envelope_nao_vaza_endereco_do_clp():
    """O mapa real conhece DB/NodeId; o nome publicado não pode conter endereço."""
    tags = load_tags(json.loads((GATEWAY / "config/tagmap.n2.json").read_text(encoding="utf-8")))
    for t in tags:
        assert "db" not in t.tag.split(".")[0] and "ns=" not in t.tag
