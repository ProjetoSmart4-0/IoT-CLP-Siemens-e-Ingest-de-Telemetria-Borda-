"""UR3e simulado: envia uma linha JSON por pacote a 10 Hz na porta 30004.

Simplificação didática do RTDE (o RTDE real é binário). Campos com os mesmos nomes do RTDE.
"""
import asyncio
import json
import math
import os


async def handle(reader, writer):
    t = 0.0
    try:
        while True:
            t += 0.1
            packet = {
                "timestamp": round(t, 3),  # uptime do controlador (s)
                "actual_q": [round(0.2 * math.sin(t + i), 4) for i in range(6)],
                "actual_TCP_pose": [0.4, 0.1, 0.3, 0.0, 0.0, 1.57],
                "runtime_state": 2 if int(t) % 20 < 15 else 4,  # executando / pausado
            }
            writer.write((json.dumps(packet) + "\n").encode())
            await writer.drain()
            await asyncio.sleep(0.1)
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def main(port: int = 30004):
    server = await asyncio.start_server(handle, "0.0.0.0", port)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main(int(os.environ.get("PORT", "30004"))))
