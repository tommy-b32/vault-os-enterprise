export const SUPPORTED_ORDER_WEBHOOK_TOPICS = new Set([
  "orders/create", "orders/updated", "orders/cancelled", "refunds/create",
]);

export function cleanShopDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyShopifyWebhookHmac(rawBody: Uint8Array, providedHmac: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const calculated = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody as Uint8Array<ArrayBuffer>));
  const provided = decodeBase64(providedHmac);
  return provided !== null && constantTimeEqual(calculated, provided);
}
