import "server-only";
import * as XLSX from "xlsx";
import {parseSalesWorkbook} from "./WorkbookParser";
import {correctionColumn,type SalesOrderCorrection,readinessForCorrection} from "./SalesOrderCorrection";

export class SalesOrderCorrectionValidationError extends Error{}
export type CorrectionPreview={rowNumber:number;original:unknown;corrected:unknown;readinessBefore:"READY"|"REVIEW";readinessAfter:"READY"|"REVIEW";bytes:Uint8Array};
const value=(sheet:XLSX.WorkSheet,row:number,column:number)=>sheet[XLSX.utils.encode_cell({r:row-1,c:column})]?.v??null;
const sheetFingerprint=(sheet:XLSX.WorkSheet|undefined)=>{
 if(!sheet)throw new SalesOrderCorrectionValidationError("Required workbook worksheet is missing");
 return JSON.stringify(Object.entries(sheet).filter(([address])=>!address.startsWith("!")).sort(([a],[b])=>a.localeCompare(b)).map(([address,cell])=>[address,{v:cell.v,f:cell.f,t:cell.t,z:cell.z}]));
};
const verifyPreservedSheets=(book:XLSX.WorkBook,costingsBefore:string,dashboardBefore:string)=>{
 const output=new Uint8Array(XLSX.write(book,{bookType:"xlsx",type:"array",compression:true}));
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
 if(column===undefined){const original={row:matches[0].values};if(expectedOriginal!==undefined&&JSON.stringify(original)!==JSON.stringify(expectedOriginal))throw new SalesOrderCorrectionValidationError("Original workbook value changed after proposal");return{rowNumber:row,original,corrected:correction.value,readinessBefore:"REVIEW",readinessAfter:"REVIEW",bytes:verifyPreservedSheets(book,costingsBefore,dashboardBefore)};}
 const original=value(sales,row,column);if(expectedOriginal!==undefined&&JSON.stringify(original)!==JSON.stringify(expectedOriginal))throw new SalesOrderCorrectionValidationError("Original workbook value changed after proposal");
 const before=readinessForCorrection(correction.type,original),after=readinessForCorrection(correction.type,correction.value);
 if(!after)throw new SalesOrderCorrectionValidationError("Readiness cannot be proven");
 const cell=sales[XLSX.utils.encode_cell({r:row-1,c:column})]??(sales[XLSX.utils.encode_cell({r:row-1,c:column})]={t:"s",v:""});cell.v=correction.value;cell.t=typeof correction.value==="number"?"n":"s";cell.w=String(correction.value);
 return {rowNumber:row,original,corrected:correction.value,readinessBefore:before,readinessAfter:after,bytes:verifyPreservedSheets(book,costingsBefore,dashboardBefore)};
}
