export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await parseResponse(response);
  const contentType = response.headers.get("content-type") || "";

  if (String(url).startsWith("/api/") && !contentType.includes("application/json")) {
    const snippet = typeof payload === "string" ? payload.slice(0, 200) : "";
    const detail = snippet ? ` — ${snippet.replace(/\s+/g, " ").trim()}` : "";
    throw new ApiError(
      `Réponse API invalide (HTTP ${response.status})${detail}`,
      response.status,
      payload,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event("session-expired"));
    }
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: string }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function asArray<T>(payload: unknown): T[] {
  return Array.isArray(payload) ? payload : [];
}

export function getJson<T>(url: string) {
  return requestJson<T>(url);
}

export function postJson<T>(url: string, body?: unknown) {
  return requestJson<T>(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function patchJson<T>(url: string, body?: unknown) {
  return requestJson<T>(url, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
