type GraphQLBody<T> = {
  data?: T;
  errors?: Array<{ extensions?: { code?: string } }>;
  extensions?: { cost?: {
    requestedQueryCost?: number;
    throttleStatus?: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
  } };
};

// Historical reads only. Never retry a mutation or log response bodies.
export async function boundedShopifyRead<T>(
  request: (signal: AbortSignal) => Promise<Response>,
  deadline: number,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  const pause = async (ms: number) => {
    if (!Number.isFinite(ms) || ms > 15_000 || Date.now() + ms >= deadline) {
      throw new Error("Historical Shopify read exhausted its time budget; retry the same window later");
    }
    if (ms > 0) await sleep(ms);
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Historical Shopify read deadline exceeded");
    let response: Response;
    try {
      response = await request(AbortSignal.timeout(Math.min(10_000, remaining)));
    } catch {
      if (attempt === 3) throw new Error("Historical Shopify connection failed after bounded retries");
      await pause(1000 * 2 ** attempt);
      continue;
    }
    let body: GraphQLBody<T> = {};
    try { body = await response.json(); } catch { /* Only status is used for non-JSON errors. */ }
    const cost = body.extensions?.cost;
    const throttle = cost?.throttleStatus;
    const requested = cost?.requestedQueryCost ?? 0;
    if (throttle && requested > throttle.maximumAvailable) {
      throw new Error("Historical Shopify query exceeds the available cost capacity");
    }
    const costWait = throttle && throttle.restoreRate > 0
      ? Math.ceil(Math.max(0, requested - throttle.currentlyAvailable) / throttle.restoreRate * 1000)
      : 0;
    const throttled = body.errors?.length && body.errors.every((error) => error.extensions?.code === "THROTTLED");
    if (response.status === 429 || response.status >= 500 || throttled) {
      if (attempt === 3) throw new Error("Historical Shopify throttling/service failure exhausted bounded retries");
      const retryAfter = response.headers.get("retry-after");
      const retryMs = retryAfter === null ? 0 : /^\d+(\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
      await pause(Math.max(1000 * 2 ** attempt, costWait, retryMs));
      continue;
    }
    if (!response.ok || body.errors?.length || !body.data) {
      throw new Error(`Historical Shopify read rejected (HTTP ${response.status}); check scopes and query limits`);
    }
    await pause(costWait);
    return body.data;
  }
  throw new Error("Historical Shopify read exhausted bounded retries");
}
