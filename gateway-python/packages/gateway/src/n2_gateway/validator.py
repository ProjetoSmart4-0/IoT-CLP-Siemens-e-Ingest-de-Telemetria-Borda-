"""Validação do envelope contra o JSON Schema compartilhado (fonte única da verdade)."""
from __future__ import annotations

import json
from pathlib import Path

from jsonschema import Draft202012Validator


class EnvelopeValidator:
    def __init__(self, schema_path: str | Path):
        schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        self._v = Draft202012Validator(schema)

    def errors(self, env: dict) -> list[str]:
        return [f"{'/'.join(map(str, e.path)) or '<raiz>'}: {e.message}" for e in self._v.iter_errors(env)]

    def validate(self, env: dict) -> dict:
        errs = self.errors(env)
        if errs:
            raise ValueError(f"Envelope fora do contrato ({env.get('tag')}): {errs}")
        return env
