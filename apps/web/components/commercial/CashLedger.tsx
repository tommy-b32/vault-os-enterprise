"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  addCashTransaction,
  type CashLedgerActionState,
} from "@/app/commercial/actions";
import type { CashLedgerSnapshot } from "@/lib/business/CashLedgerRepository";
import {
  CASH_CATEGORIES,
  type CashDirection,
} from "@/lib/business/CashLedgerRules";

type CashLedgerProps = {
  snapshot: CashLedgerSnapshot | null;
  errorMessage: string | null;
  canCreateTransactions: boolean;
};

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatPence(pence: number): string {
  return currencyFormatter.format(pence / 100);
}

function londonToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function SaveTransactionButton() {
  const { pending } = useFormStatus();

  return (
    <button className="cash-ledger-save" disabled={pending} type="submit">
      {pending ? "Recording transaction…" : "Record transaction"}
    </button>
  );
}

export function CashLedger({ snapshot, errorMessage, canCreateTransactions }: CashLedgerProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [direction, setDirection] = useState<CashDirection>("money_in");
  const [submissionId, setSubmissionId] = useState("");
  const initialState: CashLedgerActionState = { status: "idle", message: "" };
  const [saveState, saveAction] = useActionState(addCashTransaction, initialState);

  useEffect(() => {
    if (saveState.status !== "success") return;

    formRef.current?.reset();
    dialogRef.current?.close();
    router.refresh();
    queueMicrotask(() => {
      setDirection("money_in");
      setSubmissionId(crypto.randomUUID());
    });
  }, [router, saveState]);

  function openDialog() {
    setSubmissionId(crypto.randomUUID());
    dialogRef.current?.showModal();
  }

  return (
    <section className="commercial-card cash-ledger">
      <header className="commercial-card-header">
        <div>
          <p className="vault-eyebrow">Canonical Finance</p>
          <h2>Cash Ledger</h2>
          <p>Append-only business cash movements and their resulting balance.</p>
        </div>

        {canCreateTransactions ? (
          <button className="cash-ledger-add" onClick={openDialog} type="button">Add transaction</button>
        ) : <span className="purchasing-state">View only</span>}
      </header>

      {saveState.message ? (
        <p className={`cash-ledger-feedback is-${saveState.status}`} role="status">
          {saveState.message}
        </p>
      ) : null}

      {errorMessage || !snapshot ? (
        <div className="cash-ledger-state is-error" role="alert">
          <strong>Finance unavailable</strong>
          <span>{errorMessage ?? "The canonical cash ledger could not be loaded."}</span>
        </div>
      ) : (
        <>
          <div className="cash-ledger-balance">
            <span>Current ledger cash</span>
            <strong>{formatPence(snapshot.balancePence)}</strong>
          </div>

          {snapshot.transactions.length === 0 ? (
            <div className="cash-ledger-state">
              <strong>No transactions yet</strong>
              <span>Add the first cash movement to begin the ledger.</span>
            </div>
          ) : (
            <div className="cash-ledger-table-wrap">
              <table className="cash-ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{dateFormatter.format(new Date(`${transaction.effectiveDate}T12:00:00Z`))}</td>
                      <td>
                        <strong>{transaction.description}</strong>
                        <span>{transaction.transactionType.replaceAll("_", " ")}</span>
                      </td>
                      <td>{transaction.category}</td>
                      <td>{transaction.reference ?? "—"}</td>
                      <td className={transaction.amountPence > 0 ? "money-in" : "money-out"}>
                        {transaction.amountPence > 0 ? "+" : "−"}
                        {formatPence(Math.abs(transaction.amountPence))}
                      </td>
                      <td>{formatPence(transaction.resultingBalancePence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <dialog className="cash-ledger-dialog" ref={dialogRef}>
        <form action={saveAction} className="cash-ledger-form" ref={formRef}>
          <input name="submission_id" type="hidden" value={submissionId} />

          <header>
            <div>
              <p className="vault-eyebrow">Cash Ledger</p>
              <h3>Add transaction</h3>
            </div>
            <button aria-label="Close transaction form" onClick={() => dialogRef.current?.close()} type="button">×</button>
          </header>

          {saveState.status === "error" ? (
            <p className="cash-ledger-feedback is-error" role="alert">{saveState.message}</p>
          ) : null}

          <div className="cash-ledger-direction" role="group" aria-label="Transaction direction">
            <label>
              <input checked={direction === "money_in"} name="direction" onChange={() => setDirection("money_in")} type="radio" value="money_in" />
              Money In
            </label>
            <label>
              <input checked={direction === "money_out"} name="direction" onChange={() => setDirection("money_out")} type="radio" value="money_out" />
              Money Out
            </label>
          </div>

          <div className="cash-ledger-form-grid">
            <label>
              Amount (GBP)
              <input inputMode="decimal" min="0.01" name="amount" placeholder="200.00" required step="0.01" type="number" />
            </label>
            <label>
              Effective date
              <input defaultValue={londonToday()} name="effective_date" required type="date" />
            </label>
            <label className="is-wide">
              Description
              <input maxLength={200} name="description" placeholder="What was this transaction for?" required type="text" />
            </label>
            <label>
              Category
              <select key={direction} name="category" required>
                {CASH_CATEGORIES[direction].map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Reference (optional)
              <input maxLength={200} name="reference" placeholder="Payout or order reference" type="text" />
            </label>
            <label className="is-wide">
              Internal note (optional)
              <textarea maxLength={1000} name="notes" rows={3} />
            </label>
          </div>

          <footer>
            <button className="cash-ledger-cancel" onClick={() => dialogRef.current?.close()} type="button">Cancel</button>
            <SaveTransactionButton />
          </footer>
        </form>
      </dialog>
    </section>
  );
}
