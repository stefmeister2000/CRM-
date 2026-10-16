/** Accept only Google-generated identifiers, never names, email or free text. */
export function ga4Context(value: unknown): { clientId: string; sessionId?: string } | null {
  if (!value || typeof value !== "object") return null;
  const { clientId, sessionId } = value as Record<string, unknown>;
  if (typeof clientId !== "string" || !/^\d{1,20}\.\d{1,20}$/.test(clientId)) return null;
  return {
    clientId,
    ...(typeof sessionId === "string" && /^\d{1,20}$/.test(sessionId) ? { sessionId } : {}),
  };
}
