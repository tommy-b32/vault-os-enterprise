import "server-only";

import * as XLSX from "xlsx";

import { normalizeWorkbookOrderNumber, parseSalesWorkbook } from "./WorkbookParser";

export type GovernedTrackingByOrder = ReadonlyMap<string, readonly string[]>;

export type TrackingRepairPreparation = {
  bytes: Uint8Array;
  eligibleOrderNumbers: string[];
  blockedOrderNumbers: string[];
  rowsUpdated: number;
  alreadyCorrectRows: number;
  skippedNoTracking: number;
  skippedAmbiguousTracking: number;
  skippedConflictTracking: number;
};

export class SalesWorkbookTrackingRepairValidationError extends Error {}

const trackingColumn = 8;

function distinctTracking(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}

function sheetCell(sheet: XLSX.WorkSheet, rowNumber: number, column: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: rowNumber - 1, c: column })];
}

function displayedCellValue(cell: XLSX.CellObject | undefined): string {
  return cell?.v === undefined || cell?.v === null ? "" : String(cell.v);
}

function hasDifferentTracking(cell: XLSX.CellObject | undefined, tracking: string): boolean {
  if (!cell) return false;
  if (cell.f) return true;
  const current = displayedCellValue(cell);
  return current !== "" && current !== tracking;
}

/**
 * Applies no I/O. It only prepares an in-memory immutable-workbook successor
 * whose sole permitted data mutation is Sales column I for an existing order group.
 */
export function prepareSalesWorkbookTrackingRepair(
  bytes: ArrayBuffer | Uint8Array,
  targetOrderNumbers: readonly string[],
  governedTracking: GovernedTrackingByOrder,
): TrackingRepairPreparation {
  const sourceBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parsed = parseSalesWorkbook(Uint8Array.from(sourceBytes).buffer);
  if (!parsed.valid) throw new SalesWorkbookTrackingRepairValidationError("Sales workbook layout is invalid");

  const workbook = XLSX.read(sourceBytes, { type: "array", cellFormula: true, cellStyles: true, bookVBA: true });
  const sales = workbook.Sheets.Sales;
  if (!sales) throw new SalesWorkbookTrackingRepairValidationError("Sales worksheet is missing");

  const groups = new Map<string, typeof parsed.rows>();
  for (const row of parsed.rows) {
    if (!row.orderNumber) continue;
    const group = groups.get(row.orderNumber) ?? [];
    group.push(row);
    groups.set(row.orderNumber, group);
  }

  const targetOrders = [...new Set(targetOrderNumbers.map(normalizeWorkbookOrderNumber).filter((value): value is string => value !== null))]
    .sort((left, right) => Number(left) - Number(right));
  if (targetOrders.length !== targetOrderNumbers.length) {
    throw new SalesWorkbookTrackingRepairValidationError("Tracking repair target order number is invalid or duplicated");
  }

  const eligibleOrderNumbers: string[] = [];
  const blockedOrderNumbers: string[] = [];
  let rowsUpdated = 0;
  let alreadyCorrectRows = 0;
  let skippedNoTracking = 0;
  let skippedAmbiguousTracking = 0;
  let skippedConflictTracking = 0;

  for (const orderNumber of targetOrders) {
    const rows = groups.get(orderNumber);
    if (!rows?.length) {
      blockedOrderNumbers.push(orderNumber);
      skippedConflictTracking += 1;
      continue;
    }
    const values = distinctTracking(governedTracking.get(orderNumber) ?? []);
    if (values.length === 0) {
      blockedOrderNumbers.push(orderNumber);
      skippedNoTracking += 1;
      continue;
    }
    if (values.length !== 1) {
      blockedOrderNumbers.push(orderNumber);
      skippedAmbiguousTracking += 1;
      continue;
    }
    const tracking = values[0];
    const cells = rows.map((row) => sheetCell(sales, row.rowNumber, trackingColumn));
    if (cells.some((cell) => hasDifferentTracking(cell, tracking))) {
      blockedOrderNumbers.push(orderNumber);
      skippedConflictTracking += 1;
      continue;
    }
    eligibleOrderNumbers.push(orderNumber);
    for (const [index, cell] of cells.entries()) {
      if (displayedCellValue(cell) === tracking) {
        alreadyCorrectRows += 1;
        continue;
      }
      const address = XLSX.utils.encode_cell({ r: rows[index].rowNumber - 1, c: trackingColumn });
      const target = cell ?? { t: "s" as const };
      target.t = "s";
      target.v = tracking;
      delete target.f;
      delete target.w;
      sales[address] = target;
      rowsUpdated += 1;
    }
  }

  if (rowsUpdated === 0) {
    return { bytes: sourceBytes, eligibleOrderNumbers, blockedOrderNumbers, rowsUpdated, alreadyCorrectRows, skippedNoTracking, skippedAmbiguousTracking, skippedConflictTracking };
  }
  return {
    bytes: new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true })),
    eligibleOrderNumbers,
    blockedOrderNumbers,
    rowsUpdated,
    alreadyCorrectRows,
    skippedNoTracking,
    skippedAmbiguousTracking,
    skippedConflictTracking,
  };
}

type ComparableCell = { value: unknown; formula: string | undefined; type: string | undefined; format: XLSX.NumberFormat | undefined };
type WorkbookSnapshot = { sheetNames: string[]; sheets: Map<string, { ref: string | undefined; merges: string; cells: Map<string, ComparableCell> }> };

function snapshot(bytes: Uint8Array): WorkbookSnapshot {
  const workbook = XLSX.read(bytes, { type: "array", cellFormula: true, cellStyles: true, bookVBA: true });
  return {
    sheetNames: [...workbook.SheetNames],
    sheets: new Map(workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const cells = new Map<string, ComparableCell>();
      for (const [address, cell] of Object.entries(sheet)) {
        if (address.startsWith("!")) continue;
        const value = cell as XLSX.CellObject;
        cells.set(address, { value: value.v, formula: value.f, type: value.t, format: value.z });
      }
      return [name, { ref: sheet["!ref"] as string | undefined, merges: JSON.stringify(sheet["!merges"] ?? []), cells }];
    })),
  };
}

function equalCell(left: ComparableCell | undefined, right: ComparableCell | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Compares semantic workbook state after serialization/reopen; binary ZIP equality is intentionally not required. */
export function verifySalesWorkbookTrackingRepairPreservation(
  original: Uint8Array,
  repaired: Uint8Array,
  allowedTrackingRows: ReadonlyMap<number, string>,
): { valid: boolean; errors: string[] } {
  const before = snapshot(original);
  const after = snapshot(repaired);
  const errors: string[] = [];
  if (JSON.stringify(before.sheetNames) !== JSON.stringify(after.sheetNames)) errors.push("Worksheet names or order changed");
  for (const name of before.sheetNames) {
    const left = before.sheets.get(name);
    const right = after.sheets.get(name);
    if (!left || !right) { errors.push(`Worksheet ${name} is missing`); continue; }
    if (left.ref !== right.ref) errors.push(`Worksheet ${name} dimensions changed`);
    if (left.merges !== right.merges) errors.push(`Worksheet ${name} merges changed`);
    for (const address of new Set([...left.cells.keys(), ...right.cells.keys()])) {
      const row = XLSX.utils.decode_cell(address).r + 1;
      const column = XLSX.utils.decode_cell(address).c;
      const allowed = name === "Sales" && column === trackingColumn && allowedTrackingRows.has(row);
      if (allowed) {
        const cell = right.cells.get(address);
        if (cell?.value !== allowedTrackingRows.get(row) || cell?.formula !== undefined) errors.push(`Sales tracking cell ${address} was not set safely`);
      } else if (!equalCell(left.cells.get(address), right.cells.get(address))) {
        errors.push(`${name} cell ${address} changed unexpectedly`);
      }
    }
  }
  const parsedBefore = parseSalesWorkbook(Uint8Array.from(original).buffer);
  const parsedAfter = parseSalesWorkbook(Uint8Array.from(repaired).buffer);
  if (!parsedBefore.valid || !parsedAfter.valid || parsedBefore.rowCount !== parsedAfter.rowCount || JSON.stringify(parsedBefore.rows.map((row) => row.rowNumber)) !== JSON.stringify(parsedAfter.rows.map((row) => row.rowNumber))) errors.push("Sales row count or row order changed");
  return { valid: errors.length === 0, errors };
}
