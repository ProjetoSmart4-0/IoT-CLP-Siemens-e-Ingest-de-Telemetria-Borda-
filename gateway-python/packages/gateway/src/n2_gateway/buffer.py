"""Buffer store-and-forward em SQLite (item 3 da Sprint 1, agora fora do Node-RED).

- Toda mensagem passa pelo buffer, mesmo online: garante ordem e sobrevive a reinício.
- Só é apagada depois do PUBACK do broker (QoS 1).
- Se estourar o limite, descarta a mais antiga e conta a perda (exposta em gateway.status).
"""
from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass


@dataclass
class Item:
    id: int
    topic: str
    payload: str
    qos: int
    retain: bool
    offline: bool


class Buffer:
    def __init__(self, path: str, max_items: int = 100_000):
        self.max_items = max_items
        self.dropped = 0
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS outbox ("
            " id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " topic TEXT NOT NULL, payload TEXT NOT NULL,"
            " qos INTEGER NOT NULL DEFAULT 1, retain INTEGER NOT NULL DEFAULT 0,"
            " offline INTEGER NOT NULL DEFAULT 0)"
        )

    def put(self, topic: str, payload: str, *, qos: int = 1, retain: bool = False, offline: bool = False) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO outbox(topic, payload, qos, retain, offline) VALUES (?,?,?,?,?)",
                (topic, payload, qos, int(retain), int(offline)),
            )
            excess = self._count() - self.max_items
            if excess > 0:
                self._db.execute(
                    "DELETE FROM outbox WHERE id IN (SELECT id FROM outbox ORDER BY id LIMIT ?)", (excess,)
                )
                self.dropped += excess

    def peek(self, limit: int = 100) -> list[Item]:
        with self._lock:
            rows = self._db.execute(
                "SELECT id, topic, payload, qos, retain, offline FROM outbox ORDER BY id LIMIT ?", (limit,)
            ).fetchall()
        return [Item(r[0], r[1], r[2], r[3], bool(r[4]), bool(r[5])) for r in rows]

    def ack(self, item_id: int) -> None:
        with self._lock:
            self._db.execute("DELETE FROM outbox WHERE id = ?", (item_id,))

    def _count(self) -> int:
        return self._db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]

    def __len__(self) -> int:
        with self._lock:
            return self._count()

    def close(self) -> None:
        with self._lock:
            self._db.close()
