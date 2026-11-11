"""Mapa de tags: nome semântico -> endereço no equipamento.

É o ÚNICO lugar que conhece endereços. O envelope publica só o nome semântico (ex.: machine.state).
Formato de cada entrada (config/tagmap.*.json):
  {
    "tag": "machine.state",            # padrão ^[a-z_]+(\\.[a-z_]+)+$
    "component_id": "plc",
    "node": {"browse_path": ["Machine", "State"], "ns_uri": "http://n2.local/mock"}
            ou {"node_id": "ns=3;s=\\"DB_ESTADO\\".\\"estado\\""},
    "value_type": "string", "unit": null,
    "enum": {"0": "parada", ...}       # opcional: traduz código numérico em texto
  }
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

TAG_RE = re.compile(r"^[a-z_]+(\.[a-z_]+)+$")


@dataclass(frozen=True)
class TagDef:
    tag: str
    node: dict
    value_type: str
    unit: str | None = None
    component_id: str | None = None
    enum: dict[str, str] = field(default_factory=dict)

    def convert(self, raw: Any) -> Any:
        if self.enum and raw is not None:
            key = str(int(raw)) if isinstance(raw, (int, float, bool)) else str(raw)
            return self.enum.get(key, f"desconhecido_{key}")
        return raw


def load_tags(tagmap: dict) -> list[TagDef]:
    tags = []
    seen = set()
    for item in tagmap.get("plc_tags", []):
        t = TagDef(
            tag=item["tag"],
            node=item["node"],
            value_type=item["value_type"],
            unit=item.get("unit"),
            component_id=item.get("component_id"),
            enum={str(k): v for k, v in item.get("enum", {}).items()},
        )
        if not TAG_RE.match(t.tag):
            raise ValueError(f"Tag fora do padrão do contrato: {t.tag}")
        if t.tag in seen:
            raise ValueError(f"Tag duplicada no mapa: {t.tag}")
        if "node_id" not in t.node and "browse_path" not in t.node:
            raise ValueError(f"Tag {t.tag} sem node_id nem browse_path")
        seen.add(t.tag)
        tags.append(t)
    return tags
