import "server-only";
import * as XLSX from "xlsx";
import {parseSalesWorkbook} from "./WorkbookParser";
import {correctionColumn,type SalesOrderCorrection,readinessForCorrection} from "./SalesOrderCorrection";
import {patchSalesWorksheetValues} from "./SalesWorksheetOoxmlPatch";

export class SalesOrderCorrectionValidationError extends Error{}
export type CorrectionPreview={rowNumber:number;original:unknown;corrected:unknown;readinessBefore:"READY"|"REVIEW";readinessAfter:"READY"|"REVIEW";bytes:Uint8Array};
const value=(sheet:XLSX.WorkSheet,row:number,column:number)=>sheet[XLSX.utils.encode_cell({r:row-1,c:column})]?.v??null;
const money=(value:unknown):number|null=>{
 if(typeof value==="number")return Number.isFinite(value)?value:null;
 if(typeof value!=="string")return null;
 const cleaned=value.replace(/[^0-9.-]/g,"");if(!cleaned)return null;
 const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:null;
};
const setCell=(sheet:XLSX.WorkSheet,row:number,column:number,value:unknown)=>{
 const address=XLSX.utils.encode_cell({r:row-1,c:column}),cell=sheet[address]??(sheet[address]={t:"s",v:""});
 delete cell.f;cell.v=value;cell.t=typeof value==="number"?"n":"s";cell.w=String(value??"");
};
const recalculateProfit=(sheet:XLSX.WorkSheet,row:number)=>{
 // Column 2 is informational Cost. Column 3 (Unit COGS / Cost & Ship) is the
 // sole product-cost deduction, so corrected workbooks cannot double count it.
 const inputs=[1,3,4,5].map(column=>money(value(sheet,row,column)));
 if(inputs.some((input):input is null=>input===null)){setCell(sheet,row,6,"");return;}
 setCell(sheet,row,6,inputs[0]!-inputs[1]!-inputs[2]!-inputs[3]!);
};
const sheetFingerprint=(sheet:XLSX.WorkSheet|undefined)=>{
 if(!sheet)throw new SalesOrderCorrectionValidationError("Required workbook worksheet is missing");
 return JSON.stringify(Object.entries(sheet).filter(([address])=>!address.startsWith("!")).sort(([a],[b])=>a.localeCompare(b)).map(([address,cell])=>[address,{v:cell.v,f:cell.f,t:cell.t,z:cell.z}]));
};
const verifyPreservedSheets=(output:Uint8Array,costingsBefore:string,dashboardBefore:string)=>{
 const reloaded=XLSX.read(output,{type:"array",cellFormula:true,cellStyles:true});
 if(costingsBefore!==sheetFingerprint(reloaded.Sheets.Costings)||dashboardBefore!==sheetFingerprint(reloaded.Sheets.Dashboard))throw new SalesOrderCorrectionValidationError("Correction changed Costings or Dashboard");
 return output;
};
export function prepareSalesOrderCorrection(bytes:Uint8Array,correction:SalesOrderCorrection,expectedOriginal?:unknown):CorrectionPreview{
 const parsed=parseSalesWorkbook(Uint8Array.from(bytes).buffer);if(!parsed.valid)throw new SalesOrderCorrectionValidationError("Sales workbook layout is invalid");
 const candidates=parsed.rows.filter(x=>x.orderNumber===correction.orderNumber&&x.values.some(Boolean));
 const matches=correction.mappedRowNumber===undefined?candidates:candidates.filter(x=>x.rowNumber===correction.mappedRowNumber);
 if(matches.length!==1)throw new SalesOrderCorrectionValidationError("Sales order mapping is ambiguous");
 const column=correctionColumn[correction.type];
 const row=matches[0].rowNumber,book=XLSX.read(bytes,{type:"array",cellFormula:true,cellStyles:true,bookVBA:true}),sales=book.Sheets.Sales;if(!sales)throw new SalesOrderCorrectionValidationError("Sales worksheet is missing");
 const costingsBefore=sheetFingerprint(book.Sheets.Costings),dashboardBefore=sheetFingerprint(book.Sheets.Dashboard);
 // Classification and exchange treatments are deliberately audit-only: no
 // historical Sales value is fabricated.  Their complete original row is the
 // immutable evidence snapshot and their governed state remains REVIEW.
 if(column===undefined){const original={row:matches[0].values};if(expectedOriginal!==undefined&&JSON.stringify(original)!==JSON.stringify(expectedOriginal))throw new SalesOrderCorrectionValidationError("Original workbook value changed after proposal");return{rowNumber:row,original,corrected:correction.value,readinessBefore:"REVIEW",readinessAfter:"REVIEW",bytes:verifyPreservedSheets(bytes,costingsBefore,dashboardBefore)};}
 const original=value(sales,row,column);if(expectedOriginal!==undefined&&JSON.stringify(original)!==JSON.stringify(expectedOriginal))throw new SalesOrderCorrectionValidationError("Original workbook value changed after proposal");
 const before=readinessForCorrection(correction.type,original),after=readinessForCorrection(correction.type,correction.value);
 if(!after)throw new SalesOrderCorrectionValidationError("Readiness cannot be proven");
 setCell(sales,row,column,correction.value);
 if(["sale_price","cogs","postage","card_fee"].includes(correction.type))recalculateProfit(sales,row);
 const updates=[{rowNumber:row,column,value:correction.value as string|number}];
 if(["sale_price","cogs","postage","card_fee"].includes(correction.type))updates.push({rowNumber:row,column:6,value:value(sales,row,6) as string|number});
 return {rowNumber:row,original,corrected:correction.value,readinessBefore:before,readinessAfter:after,bytes:verifyPreservedSheets(patchSalesWorksheetValues(bytes,updates),costingsBefore,dashboardBefore)};
}
export type BatchCorrectionPreview={rowNumber:number;original:unknown;corrected:unknown;readinessBefore:"READY"|"REVIEW";readinessAfter:"READY"|"REVIEW";orderNumber:string;type:SalesOrderCorrection["type"]};
/** Applies all staged financial values before deriving each affected order profit, then patches Sales XML once. */
export function prepareSalesOrderCorrectionBatch(bytes:Uint8Array,corrections:SalesOrderCorrection[]):{previews:BatchCorrectionPreview[];bytes:Uint8Array}{
 if(!corrections.length)throw new SalesOrderCorrectionValidationError("Batch has no corrections");
 const parsed=parseSalesWorkbook(Uint8Array.from(bytes).buffer);if(!parsed.valid)throw new SalesOrderCorrectionValidationError("Sales workbook layout is invalid");
 const book=XLSX.read(bytes,{type:"array",cellFormula:true,cellStyles:true,bookVBA:true}),sales=book.Sheets.Sales;if(!sales)throw new SalesOrderCorrectionValidationError("Sales worksheet is missing");
 const costingsBefore=sheetFingerprint(book.Sheets.Costings),dashboardBefore=sheetFingerprint(book.Sheets.Dashboard),updates:Array<{rowNumber:number;column:number;value:string|number}>=[],affected=new Set<number>(),seen=new Set<string>(),previews:BatchCorrectionPreview[]=[];
 for(const correction of corrections){const column=correctionColumn[correction.type];if(column===undefined||!["sale_price","cogs","postage","card_fee"].includes(correction.type))throw new SalesOrderCorrectionValidationError("Batch corrections support financial fields only");const key=`${correction.orderNumber}:${column}`;if(seen.has(key))throw new SalesOrderCorrectionValidationError("Batch correction contains a duplicate financial cell");seen.add(key);const candidates=parsed.rows.filter(x=>x.orderNumber===correction.orderNumber&&x.values.some(Boolean)),matches=correction.mappedRowNumber===undefined?candidates:candidates.filter(x=>x.rowNumber===correction.mappedRowNumber);if(matches.length!==1)throw new SalesOrderCorrectionValidationError("Sales order mapping is ambiguous");const row=matches[0].rowNumber,original=value(sales,row,column),before=readinessForCorrection(correction.type,original),after=readinessForCorrection(correction.type,correction.value);if(!after)throw new SalesOrderCorrectionValidationError("Readiness cannot be proven");setCell(sales,row,column,correction.value);updates.push({rowNumber:row,column,value:correction.value as number});affected.add(row);previews.push({rowNumber:row,original,corrected:correction.value,readinessBefore:before,readinessAfter:after,orderNumber:correction.orderNumber,type:correction.type});}
 for(const row of affected){recalculateProfit(sales,row);updates.push({rowNumber:row,column:6,value:value(sales,row,6) as string|number});}
 return{previews,bytes:verifyPreservedSheets(patchSalesWorksheetValues(bytes,updates),costingsBefore,dashboardBefore)};
}
