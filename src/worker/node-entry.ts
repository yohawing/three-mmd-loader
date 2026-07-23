import { parentPort } from "node:worker_threads";
import type { TransferListItem } from "node:worker_threads";

import { MmdRuntimeWorkerDispatcher } from "./dispatcher.js";
import type {
  MmdRuntimeWorkerCommandEnvelope,
  MmdRuntimeWorkerEventEnvelope
} from "./messages.js";

const port = parentPort;
if (!port) {
  throw new Error("MMD runtime worker_threads entry requires parentPort");
}

const dispatcher = new MmdRuntimeWorkerDispatcher({
  postMessage(message: MmdRuntimeWorkerEventEnvelope, transfer?: Transferable[]) {
    if (transfer) {
      port.postMessage(message, transfer as unknown as readonly TransferListItem[]);
    } else {
      port.postMessage(message);
    }
  }
});

port.on("message", (command: MmdRuntimeWorkerCommandEnvelope) => {
  dispatcher.handle(command);
});
