/// <reference lib="webworker" />

import { MmdRuntimeWorkerDispatcher } from "./dispatcher.js";
import type {
  MmdRuntimeWorkerCommandEnvelope,
  MmdRuntimeWorkerEventEnvelope
} from "./messages.js";

const workerScope = self as DedicatedWorkerGlobalScope;
const dispatcher = new MmdRuntimeWorkerDispatcher({
  postMessage(message: MmdRuntimeWorkerEventEnvelope, transfer?: Transferable[]) {
    if (transfer) {
      workerScope.postMessage(message, transfer);
    } else {
      workerScope.postMessage(message);
    }
  }
});

workerScope.addEventListener("message", (event: MessageEvent<MmdRuntimeWorkerCommandEnvelope>) => {
  dispatcher.handle(event.data);
});
