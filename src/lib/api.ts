/** Calls one of our own JSON endpoints. Throws with the server's message on failure. */
export async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: data === undefined ? undefined : { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Something went wrong.");
  return json as T;
}
