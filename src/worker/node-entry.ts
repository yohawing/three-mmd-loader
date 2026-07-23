import { parentPort } from "node:worker_threads";
import type { TransferListItem } from "node:worker_threads";

import { MmdRuntimeWorkerEndpoint } from "./endpoint.js";
import type { MmdRuntimeWorkerCommand, MmdRuntimeWorkerEvent } from "./messages.js";

const port = parentPort;
if (!port) {
  throw new Error("MMD runtime worker_threads entry requires parentPort");
}

const endpoint = new MmdRuntimeWorkerEndpoint({
  postMessage(message: MmdRuntimeWorkerEvent, transfer?: Transferable[]) {
    port.postMessage(message, transfer as unknown as readonly TransferListItem[]);
  }
});

port.on("message", (command: MmdRuntimeWorkerCommand) => {
  endpoint.handle(command);
});
