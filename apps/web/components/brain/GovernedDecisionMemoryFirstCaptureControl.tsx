"use client";

import { useActionState } from "react";

import {
  createFirstGovernedDecisionMemoryBaseline,
  initialGovernedDecisionMemoryCaptureState,
} from "@/app/missions/governed-memory-actions";

export function GovernedDecisionMemoryFirstCaptureControl() {
  const [state, action, pending] = useActionState(
    createFirstGovernedDecisionMemoryBaseline,
    initialGovernedDecisionMemoryCaptureState,
  );

  return (
    <section aria-labelledby="governed-memory-first-capture">
      <p>Governed Decision Memory — First Capture</p>
      <h2 id="governed-memory-first-capture">Create the first governed baseline</h2>
      <p>Creates the first immutable governed decision baseline. Run once only.</p>
      <form action={action}>
        <button disabled={pending || state.status === "success"} type="submit">
          {pending ? "CREATING GOVERNED BASELINE…" : "CREATE FIRST GOVERNED BASELINE"}
        </button>
      </form>
      {state.status === "success" ? (
        <dl>
          <div><dt>Inserted</dt><dd>{state.inserted ? "true" : "false"}</dd></div>
          <div><dt>Capture kind</dt><dd>{state.captureKind ?? "none"}</dd></div>
          <div><dt>Observed at</dt><dd>{state.observedAt}</dd></div>
        </dl>
      ) : null}
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    </section>
  );
}
