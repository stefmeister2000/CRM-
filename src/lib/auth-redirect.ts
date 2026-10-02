/** Accept only local paths, including after browser URL normalization. */
export function safeNext(next: string | undefined) {
  if (
    !next ||
    !next.startsWith("/") ||
    next.includes("\\") ||
    [...next].some((char) => char.charCodeAt(0) <= 32)
  )
    return undefined;
  try {
    const origin = "https://crm.invalid";
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : undefined;
  } catch {
    return undefined;
  }
}
