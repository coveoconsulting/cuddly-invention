import { ApiError, requestJson } from "./api";

/**
 * Offline write queue for the field-sales force.
 *
 * Field reps often lose connectivity. Writes routed through `sendOrQueue` are
 * sent immediately when online; when the network is down (or a request fails
 * with a transport error) they are persisted to localStorage and replayed, in
 * order, as soon as connectivity returns. Server rejections (HTTP 4xx/5xx) are
 * NOT queued — they surface to the caller as usual.
 */

const STORAGE_KEY = "fct.offlineQueue.v1";

export interface QueuedWrite {
  id: string;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  label: string;
  createdAt: string;
}

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();
let flushing = false;

function load(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function save(queue: QueuedWrite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full / unavailable — best effort */
  }
  listeners.forEach((cb) => cb(queue.length));
}

export function pendingCount(): number {
  return load().length;
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  cb(pendingCount());
  return () => listeners.delete(cb);
}

function isNetworkError(error: unknown): boolean {
  // requestJson throws ApiError when the server responded — those are real
  // rejections we must not retry blindly. Anything else is a transport failure.
  return !(error instanceof ApiError);
}

export interface SendResult<T> {
  queued: boolean;
  data?: T;
}

/** Send a write now, or queue it for later if the device is offline. */
export async function sendOrQueue<T>(
  method: QueuedWrite["method"],
  url: string,
  body: unknown,
  label: string,
): Promise<SendResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue({ method, url, body, label });
    return { queued: true };
  }
  try {
    const data = await requestJson<T>(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { queued: false, data };
  } catch (error) {
    if (isNetworkError(error)) {
      enqueue({ method, url, body, label });
      return { queued: true };
    }
    throw error;
  }
}

function enqueue(item: Omit<QueuedWrite, "id" | "createdAt">): void {
  const queue = load();
  queue.push({
    ...item,
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  save(queue);
}

/** Replay queued writes in order. Stops at the first transport failure. */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    let queue = load();
    while (queue.length > 0) {
      const next = queue[0];
      try {
        await requestJson(next.url, {
          method: next.method,
          body: next.body === undefined ? undefined : JSON.stringify(next.body),
        });
      } catch (error) {
        if (isNetworkError(error)) break; // still offline — retry later, keep order
        // Server rejected this item: drop it so it can't block the queue forever.
      }
      queue = load().filter((q) => q.id !== next.id);
      save(queue);
    }
  } finally {
    flushing = false;
  }
}

let started = false;
/** Wire up automatic flushing on reconnect + periodic retry. Call once at boot. */
export function startOfflineQueue(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => void flushQueue());
  window.setInterval(() => void flushQueue(), 30_000);
  void flushQueue();
}
