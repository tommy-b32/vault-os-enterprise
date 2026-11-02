import * as XLSX from "xlsx";
import { preserveCompressedOoxmlEntries, readOoxmlText } from "./OoxmlCompressedEntryPreservation";

type CellUpdate = { rowNumber: number; column: number; value: string | number };
const xmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
const xmlUnescape = (value: string) => value.replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attributes = (tag: string) => Object.fromEntries([...tag.matchAll(/([:\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, xmlUnescape(value)]));
const salesWorksheetPath = (source: Uint8Array) => {
  const workbook = readOoxmlText(source, "xl/workbook.xml");
  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((match) => match[0]).find((tag) => attributes(tag).name === "Sales");
  const relationshipId = sheetTag && attributes(sheetTag)["r:id"];
  if (!relationshipId) throw new Error("Sales worksheet relationship is missing");
  const relationships = readOoxmlText(source, "xl/_rels/workbook.xml.rels");
  const relationshipTag = [...relationships.matchAll(/<Relationship\b[^>]*>/g)].map((match) => match[0]).find((tag) => attributes(tag).Id === relationshipId);
  const target = relationshipTag && attributes(relationshipTag).Target;
  if (!target || !/^worksheets\/[A-Za-z0-9._-]+\.xml$/.test(target)) throw new Error("Sales worksheet target is invalid");
  return `xl/${target}`;
};
const replacementCell = (openTag: string, body: string, value: string | number) => {
  const attributesWithoutType = openTag.replace(/\s+t="[^"]*"/g, "");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Correction value must be finite");
    const withoutValue = body.replace(/<v(?:\s[^>]*)?>[\s\S]*?<\/v>/g, "");
    return `${attributesWithoutType} t="n">${withoutValue}<v>${value}</v></c>`;
  }
  const withoutStringValue = body.replace(/<v(?:\s[^>]*)?>[\s\S]*?<\/v>/g, "").replace(/<is(?:\s[^>]*)?>[\s\S]*?<\/is>/g, "");
  return `${attributesWithoutType} t="inlineStr">${withoutStringValue}<is><t>${xmlEscape(value)}</t></is></c>`;
};
const patchCell = (worksheet: string, reference: string, value: string | number) => {
  const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cell = new RegExp(`(<c\\b[^>]*\\br="${escapedReference}"[^>]*)(?:\\/>|>([\\s\\S]*?)<\\/c>)`);
  if (cell.test(worksheet)) return worksheet.replace(cell, (_whole, openTag: string, body: string | undefined) => replacementCell(openTag, body ?? "", value));
  const { c: column, r: rowNumber } = XLSX.utils.decode_cell(reference), columnLetter = XLSX.utils.encode_col(column);
  const styleCounts = new Map<string, number>();
  for (const tag of worksheet.match(new RegExp(`<c\\b[^>]*\\br="${columnLetter}\\d+"[^>]*>`, "g")) ?? []) { const style = attributes(tag).s; if (style !== undefined) styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1); }
  const style = [...styleCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  const newCell = replacementCell(`<c r="${reference}"${style === undefined ? "" : ` s="${style}"`}`, "", value);
  const row = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  if (!row.test(worksheet)) throw new Error(`Workbook row ${rowNumber} has no OOXML record`);
  return worksheet.replace(row, (_whole, openTag: string, body: string, closeTag: string) => {
    const laterCell = [...body.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)].find((match) => XLSX.utils.decode_cell(match[1]).c > column);
    if (!laterCell || laterCell.index === undefined) return `${openTag}${body}${newCell}${closeTag}`;
    return `${openTag}${body.slice(0, laterCell.index)}${newCell}${body.slice(laterCell.index)}${closeTag}`;
  });
};

/** Updates only Sales cell XML; every other OOXML package part remains intact. */
export function patchSalesWorksheetValues(source: Uint8Array, updates: CellUpdate[]): Uint8Array {
  if (!updates.length) throw new Error("No workbook cells were supplied");
  const unique = new Set<string>();
  for (const update of updates) {
    if (!Number.isInteger(update.rowNumber) || update.rowNumber < 1 || !Number.isInteger(update.column) || update.column < 0) throw new Error("Workbook cell address is invalid");
    const key = `${update.rowNumber}:${update.column}`; if (unique.has(key)) throw new Error("Workbook cell update is duplicated"); unique.add(key);
  }
  const worksheetPath = salesWorksheetPath(source);
  let worksheet = readOoxmlText(source, worksheetPath);
  for (const update of updates) worksheet = patchCell(worksheet, XLSX.utils.encode_cell({ r: update.rowNumber - 1, c: update.column }), update.value);
  /* Preserve every unchanged entry's compressed payload exactly as supplied. */
  return preserveCompressedOoxmlEntries(source, worksheetPath, worksheet);
}
