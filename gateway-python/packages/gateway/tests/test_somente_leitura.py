"""Garante que o gateway nunca escreve no CLP nem no robô (D-G1-06)."""
import re

from conftest import GATEWAY

PROIBIDO = re.compile(r"\b(write_value|write_attribute|set_value|write_params|call_method|\.call\()")


def test_codigo_do_gateway_nao_tem_escrita():
    achados = []
    for f in (GATEWAY / "src").rglob("*.py"):
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("#")[0]
            if PROIBIDO.search(code) and '"""' not in code and "não chama" not in line:
                achados.append(f"{f.name}:{n}: {line.strip()}")
    assert achados == [], achados
