/// <reference lib="webworker" />

import { MmdRuntimeWorkerEndpoint } from "./endpoint.js";
import type { MmdRuntimeWorkerCommand, MmdRuntimeWorkerEvent } from "./messages.js";

const workerScope = self as DedicatedWorkerGlobalScope;
const endpoint = new MmdRuntimeWorkerEndpoint({
  postMessage(message: MmdRuntimeWorkerEvent, transfer?: Transferable[]) {
    workerScope.postMessage(message, transfer ?? []);
  }
});

workerScope.addEventListener("message", (event: MessageEvent<MmdRuntimeWorkerCommand>) => {
  endpoint.handle(event.data);
});
