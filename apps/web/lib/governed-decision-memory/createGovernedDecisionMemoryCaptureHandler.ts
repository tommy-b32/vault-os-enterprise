import { timingSafeEqual } from "node:crypto";

type CaptureResult = {
  inserted: boolean;
  captureKind: "change" | "daily_baseline" | null;
};

type Capture = (observedAt: string) => Promise<CaptureResult>;

function hasMatchingBearerCredential(
  authorization: string | null,
  configuredSecret: string | undefined,
): boolean {
  if (!configuredSecret || !authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const configured = Buffer.from(configuredSecret);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

export function createGovernedDecisionMemoryCaptureHandler({
  capture,
  getSchedulerSecret,
}: {
  capture: Capture;
  getSchedulerSecret: () => string | undefined;
}) {
  return async function handleGovernedDecisionMemoryCapture(request: Request): Promise<Response> {
    if (!hasMatchingBearerCredential(
      request.headers.get("authorization"),
      getSchedulerSecret(),
    )) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const observedAt = new Date().toISOString();

    try {
      const result = await capture(observedAt);
      return Response.json({
        ok: true,
        inserted: result.inserted,
        captureKind: result.captureKind,
        observedAt,
      });
    } catch {
      console.error("Governed decision memory automatic capture failed");
      return Response.json(
        { ok: false, error: "Governed decision memory capture failed." },
        { status: 500 },
      );
    }
  };
}
