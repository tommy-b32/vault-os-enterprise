export function safeDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const parsed = new URL(value, "https://vault-os.local");
    return parsed.origin === "https://vault-os.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}
