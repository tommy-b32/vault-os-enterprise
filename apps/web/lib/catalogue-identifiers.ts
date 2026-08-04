const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseParentProductId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("A valid parent product identifier is required");
  }

  const parentProductId = value.trim();

  if (
    parentProductId.includes("::") ||
    !UUID_PATTERN.test(parentProductId)
  ) {
    throw new Error("A valid parent product identifier is required");
  }

  return parentProductId;
}
