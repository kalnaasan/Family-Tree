/// <reference lib="webworker" />
import { type LayoutRequest, createLayoutHandler, transferablesOf } from './layoutWorkerCore.ts'

const handle = createLayoutHandler()

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const response = handle(event.data)
  // the typed arrays move to the page without being copied
  self.postMessage(response, transferablesOf(response.layout))
}
