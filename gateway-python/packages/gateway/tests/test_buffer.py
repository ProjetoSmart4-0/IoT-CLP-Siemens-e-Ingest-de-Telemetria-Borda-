import json

from n2_gateway.buffer import Buffer
from n2_gateway.publisher import drain, mark_buffered, topic_for


def test_ordem_e_ack(tmp_path):
    b = Buffer(str(tmp_path / "b.sqlite"))
    for i in range(5):
        b.put("t", str(i))
    items = b.peek(10)
    assert [i.payload for i in items] == ["0", "1", "2", "3", "4"]
    b.ack(items[0].id)
    assert len(b) == 4


def test_sobrevive_a_reinicio(tmp_path):
    path = str(tmp_path / "b.sqlite")
    b = Buffer(path)
    b.put("t", "a", offline=True)
    b.close()
    b2 = Buffer(path)
    assert [i.payload for i in b2.peek()] == ["a"]
    assert b2.peek()[0].offline is True


def test_estouro_descarta_o_mais_antigo_e_conta(tmp_path):
    b = Buffer(str(tmp_path / "b.sqlite"), max_items=3)
    for i in range(5):
        b.put("t", str(i))
    assert [i.payload for i in b.peek()] == ["2", "3", "4"]
    assert b.dropped == 2


def test_mensagem_offline_sai_marcada_como_buffered(tmp_path):
    b = Buffer(str(tmp_path / "b.sqlite"))
    b.put("t", json.dumps({"tag": "machine.state", "context": {}}), offline=True)
    b.put("t", json.dumps({"tag": "machine.state", "context": {}}), offline=False)
    a, c = b.peek()
    assert json.loads(mark_buffered(a))["context"]["buffered"] is True
    assert "buffered" not in json.loads(mark_buffered(c))["context"]


async def test_drain_para_no_primeiro_erro_e_preserva_ordem(tmp_path):
    b = Buffer(str(tmp_path / "b.sqlite"))
    for i in range(5):
        b.put("t", str(i))
    sent = []

    def flaky(item, payload):
        if payload == "2":
            return False  # broker caiu no meio
        sent.append(payload)
        return True

    assert await drain(b, flaky) == 2
    assert [i.payload for i in b.peek()] == ["2", "3", "4"]  # nada pulado
    assert await drain(b, lambda i, p: sent.append(p) or True) == 3
    assert sent == ["0", "1", "2", "3", "4"]


def test_topico_por_tag():
    assert topic_for("n2/v1", "UNIDADE-SP", "N2-001", "robot.joint_position") == \
        "n2/v1/UNIDADE-SP/N2-001/robot/joint_position"
