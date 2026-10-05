const carrierHosts: Record<string, (reference: string) => string> = {
  ups: (reference) => `https://www.ups.com/track?tracknum=${encodeURIComponent(reference)}`,
  fedex: (reference) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(reference)}`,
  "royal mail": (reference) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(reference)}`,
  dhl: (reference) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(reference)}`,
  dpd: (reference) => `https://www.dpd.co.uk/service/tracking?parcel=${encodeURIComponent(reference)}`,
};

export function getCarrierTrackingUrl(carrier: string | null, reference: string | null): string | null {
  if (!carrier || !reference) return null;
  const normalizedCarrier = carrier.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  const key = ["fedex", "fed ex", "federal express"].includes(normalizedCarrier) ? "fedex" : normalizedCarrier;
  return carrierHosts[key]?.(reference.trim()) ?? null;
}
