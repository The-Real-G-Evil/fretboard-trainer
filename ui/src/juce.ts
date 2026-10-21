// Schlanke Anbindung an die Native-Function-/Event-Bridge von JUCE 8.
// Protokoll wie in JUCEs eigenem Frontend-Modul (juce_gui_extra/native/javascript):
// Aufruf ueber das Event "__juce__invoke", Antwort ueber "__juce__complete".
// Ausserhalb der App (z. B. `npm run dev` im normalen Browser) springt ein Mock ein.

import { createMockBackend } from "./mockBackend";

type ListenerToken = [string, number];

export interface JuceBackend {
  addEventListener(eventId: string, fn: (payload: any) => void): ListenerToken;
  removeEventListener(token: ListenerToken): void;
  emitEvent(eventId: string, payload: unknown): void;
}

declare global {
  interface Window {
    __JUCE__?: {
      backend: JuceBackend;
      initialisationData: Record<string, unknown[]>;
    };
  }
}

export const isNative = typeof window !== "undefined" && window.__JUCE__ !== undefined;

const backend: JuceBackend = isNative ? window.__JUCE__!.backend : createMockBackend();

let nextPromiseId = 0;
const pending = new Map<number, (result: unknown) => void>();

backend.addEventListener("__juce__complete", ({ promiseId, result }) => {
  const resolve = pending.get(promiseId);
  if (resolve) {
    pending.delete(promiseId);
    resolve(result);
  }
});

export function callNative<T = unknown>(name: string, ...params: unknown[]): Promise<T> {
  const id = nextPromiseId++;
  const promise = new Promise<T>((resolve) => pending.set(id, resolve as (r: unknown) => void));
  backend.emitEvent("__juce__invoke", { name, params, resultId: id });
  return promise;
}

export function onEvent<T>(eventId: string, fn: (payload: T) => void): () => void {
  const token = backend.addEventListener(eventId, fn);
  return () => backend.removeEventListener(token);
}
