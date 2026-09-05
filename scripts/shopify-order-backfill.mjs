import { readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BACKFILL_FROM = "2026-01-01T00:00:00.000Z";
export const BACKFILL_ENDPOINT = "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync";

export function planBackfill(through, windowHours = 168, now = Date.now()) {
  const end = Date.parse(through);
  if (!/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(through ?? "") ||
      !Number.isFinite(end) || end <= Date.parse(BACKFILL_FROM) || end > now) {
    throw new Error("--through must be a pinned, past UTC timestamp in 2026");
  }
  if (new Date(end).toISOString() !== (through.includes(".") ? through : through.replace("Z", ".000Z"))) {
    throw new Error("--through must use a valid UTC calendar date and hour");
  }
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) {
    throw new Error("--window-hours must be an integer from 1 to 168");
  }
  const windows = [];
  for (let start = Date.parse(BACKFILL_FROM); start < end; start += windowHours * 3600000) {
    windows.push({ created_from: new Date(start).toISOString(), created_before: new Date(Math.min(end, start + windowHours * 3600000)).toISOString() });
  }
  return windows;
}

export function validateReceipt(body, window) {
  if (!body || body.success !== true || body.sync_mode !== "historical_orders_by_created_at" ||
      body.created_from !== window.created_from || body.created_before !== window.created_before ||
      !Number.isInteger(body.orders_synced) || body.orders_synced < 0 || body.orders_synced > 50 ||
      !Number.isInteger(body.order_lines_synced) || body.order_lines_synced < 0 ||
      !Number.isFinite(Date.parse(body.completed_at))) {
    throw new Error("Unverified backfill response; checkpoint has not advanced");
  }
  return { ...window, orders: body.orders_synced, lines: body.order_lines_synced, completed_at: body.completed_at };
}

export async function runBackfill({ through, windowHours = 168, execute = false, checkpoint, maxWindows = 1, retryUncertain = false }, {
  fetchImpl = fetch, env = process.env, now = () => Date.now(), log = console.log,
} = {}) {
  const windows = planBackfill(through, windowHours, now());
  const pinnedThrough = windows.at(-1).created_before;
  if (!execute) {
    log(JSON.stringify({ mode: "dry-plan", endpoint: BACKFILL_ENDPOINT, from: BACKFILL_FROM, through: pinnedThrough, windows: windows.length, first: windows[0], last: windows.at(-1), invocation_limit: maxWindows }));
    return;
  }
  if (!checkpoint || !Number.isInteger(maxWindows) || maxWindows < 1 || maxWindows > 10) {
    throw new Error("Execution requires --checkpoint and --max-windows between 1 and 10");
  }
  if (!env.SUPABASE_EDGE_JWT || !env.VAULT_ORDER_SYNC_SECRET) {
    throw new Error("Approved gateway JWT and order-sync secret must be supplied through the process environment");
  }
  const path = resolve(checkpoint);
  const lockPath = path + ".lock";
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); } catch { throw new Error("Checkpoint is locked; confirm the previous runner is stopped before recovery"); }
  try {
    let state;
    try { state = JSON.parse(await readFile(path, "utf8")); } catch (error) {
      if (error.code !== "ENOENT") throw new Error("Checkpoint is unreadable; do not overwrite it");
      state = { version: 1, endpoint: BACKFILL_ENDPOINT, from: BACKFILL_FROM, through: pinnedThrough, windowHours, receipts: [], inFlight: null };
    }
    if (state.version !== 1 || state.endpoint !== BACKFILL_ENDPOINT || state.from !== BACKFILL_FROM || state.through !== pinnedThrough ||
        state.windowHours !== windowHours || !Array.isArray(state.receipts) || state.receipts.length > windows.length) {
      throw new Error("Checkpoint does not match this pinned plan");
    }
    for (let index = 0; index < state.receipts.length; index += 1) {
      const receipt = state.receipts[index];
      validateReceipt({ success: true, sync_mode: "historical_orders_by_created_at", ...receipt, orders_synced: receipt.orders, order_lines_synced: receipt.lines }, windows[index]);
    }
    if (state.inFlight) {
      const window = windows[state.receipts.length];
      if (!window || state.inFlight.created_from !== window.created_from || state.inFlight.created_before !== window.created_before ||
          !Number.isFinite(state.inFlight.started_at) || !retryUncertain || now() - state.inFlight.started_at < 600000) {
        throw new Error("Uncertain previous invocation: inspect server completion, wait at least ten minutes, then explicitly --retry-uncertain");
      }
    }
    const save = async () => {
      await writeFile(path + ".tmp", JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
      await rename(path + ".tmp", path);
    };
    for (let completed = 0; completed < maxWindows && state.receipts.length < windows.length; completed += 1) {
      const window = windows[state.receipts.length];
      state.inFlight = { ...window, started_at: now() };
      await save();
      let response;
      try {
        response = await fetchImpl(BACKFILL_ENDPOINT, {
          method: "POST", signal: AbortSignal.timeout(120000),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.SUPABASE_EDGE_JWT}`, "x-vault-sync-secret": env.VAULT_ORDER_SYNC_SECRET },
          body: JSON.stringify(window),
        });
      } catch { throw new Error("Invocation connection failed or timed out; outcome is uncertain and checkpoint remains pending"); }
      if (!response.ok) throw new Error(`Invocation returned HTTP ${response.status}; inspect sanitized server diagnostics before retrying`);
      let receipt;
      try { receipt = validateReceipt(await response.json(), window); } catch { throw new Error("Invocation receipt is invalid; checkpoint remains pending"); }
      state.receipts.push(receipt);
      state.inFlight = null;
      await save();
      log(JSON.stringify({ completed_windows: state.receipts.length, total_windows: windows.length, ...receipt }));
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

function argumentsFromCli(args) {
  const options = {};
  const flags = { "--execute": "execute", "--retry-uncertain": "retryUncertain" };
  const values = { "--through": "through", "--checkpoint": "checkpoint", "--window-hours": "windowHours", "--max-windows": "maxWindows" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (Object.hasOwn(flags, arg)) options[flags[arg]] = true;
    else if (Object.hasOwn(values, arg) && args[index + 1] && !args[index + 1].startsWith("--")) {
      const value = args[++index];
      options[values[arg]] = arg === "--window-hours" || arg === "--max-windows" ? Number(value) : value;
    } else throw new Error("Unknown or incomplete backfill argument");
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runBackfill(argumentsFromCli(process.argv.slice(2))); }
  catch (error) {
    // Only our controlled errors reach the console; no response bodies, headers or credentials.
    const message = error instanceof Error && !error.code ? error.message : "Local backfill checkpoint operation failed";
    console.error(message);
    process.exitCode = 1;
  }
}
