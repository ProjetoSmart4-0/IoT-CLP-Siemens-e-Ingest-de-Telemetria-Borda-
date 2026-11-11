"""CLP simulado (OPC UA) para desenvolvimento sem a bancada.

Variáveis NÃO são graváveis por clientes (o gateway é somente leitura).
State: 0=parada 1=pronta 2=executando 3=alarme (ciclo a cada PERIOD_S segundos).
"""
import asyncio
import logging
import os
import random

from asyncua import Server

NS_URI = "http://n2.local/mock"


async def serve(endpoint: str = "opc.tcp://0.0.0.0:4840/n2/mock", period_s: float = 2.0,
                ready: asyncio.Event | None = None, stop: asyncio.Event | None = None) -> None:
    server = Server()
    await server.init()
    server.set_endpoint(endpoint)
    server.set_server_name("N2 mock PLC")
    idx = await server.register_namespace(NS_URI)
    machine = await server.nodes.objects.add_object(idx, "Machine")
    state = await machine.add_variable(idx, "State", 0)
    part = await machine.add_variable(idx, "PartPresent", False)
    cycle = 0
    async with server:
        if ready:
            ready.set()
        while not (stop and stop.is_set()):
            cycle = (cycle + 1) % 4
            await state.write_value(cycle)  # escrita LOCAL do simulador, não do gateway
            await part.write_value(random.random() > 0.3)
            logging.info("mock-plc state=%s", cycle)
            await asyncio.sleep(period_s)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(serve(os.environ.get("ENDPOINT", "opc.tcp://0.0.0.0:4840/n2/mock"),
                      float(os.environ.get("PERIOD_S", "2"))))
