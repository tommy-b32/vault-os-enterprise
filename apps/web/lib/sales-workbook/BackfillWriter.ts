import "server-only";

import * as XLSX from "xlsx";
import { type BackfillProposalOrder, type ProposalField, type ProposedWorkbookRow } from "./BackfillProposal";
import { normalizeWorkbookOrderNumber, parseSalesWorkbook } from "./WorkbookParser";

type CompleteProposal={targetOrderRange:string;sourceComplete:boolean;proposals:BackfillProposalOrder[]};
export class SalesWorkbookBackfillValidationError extends Error{}
export type BackfillWritePreparation={bytes:Uint8Array;ordersWritten:number;rowsWritten:number;skippedExistingOrders:number;skippedReviewOrders:number;writtenOrderNumbers:string[]};

const isUnresolved=(field:ProposalField<unknown>)=>field.status==="unresolved"||field.value===null;
const rowIsComplete=(row:ProposedWorkbookRow)=>Object.values(row).every(field=>!isUnresolved(field));
const cellValue=<T>(field:ProposalField<T>)=>{if(isUnresolved(field))throw new SalesWorkbookBackfillValidationError("Ready proposal contains unresolved data");return field.value as T;};
const valuesFor=(row:ProposedWorkbookRow)=>[cellValue(row.product),cellValue(row.salePrice),cellValue(row.cost),cellValue(row.costAndShip),cellValue(row.postageFee),cellValue(row.cardFee),cellValue(row.profit),cellValue(row.posted),cellValue(row.tracking),"",cellValue(row.dateOfSale),cellValue(row.orderNumber)];
const moneyColumns=new Set([1,2,3,4,5,6]);

function copyAppendFormatting(sheet:XLSX.WorkSheet,templateRow:number,firstRow:number,rowCount:number){
 for(let row=firstRow;row<firstRow+rowCount;row++)for(let column=0;column<12;column++){
  const cell=sheet[XLSX.utils.encode_cell({r:row,c:column})];
  const template=sheet[XLSX.utils.encode_cell({r:templateRow,c:column})];
  if(!cell||!template)continue;
  if(template.z)cell.z=template.z;
  if(template.s)cell.s=template.s;
  if(moneyColumns.has(column)&&typeof cell.v!=="number")throw new SalesWorkbookBackfillValidationError("Workbook monetary value is not numeric");
 }
}

export function prepareSalesWorkbookBackfill(bytes:ArrayBuffer|Uint8Array,proposal:CompleteProposal):BackfillWritePreparation{
 if(!proposal.sourceComplete)throw new SalesWorkbookBackfillValidationError("Canonical proposal source is incomplete");
 const sourceBytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const parsed=parseSalesWorkbook(Uint8Array.from(sourceBytes).buffer);
 if(!parsed.valid)throw new SalesWorkbookBackfillValidationError("Sales workbook layout is invalid");
 const workbook=XLSX.read(sourceBytes,{type:"array",cellFormula:true,cellStyles:true,bookVBA:true});
 const sales=workbook.Sheets.Sales;
 if(!sales)throw new SalesWorkbookBackfillValidationError("Sales worksheet is missing");
 const existing=new Set(parsed.rows.map(row=>row.orderNumber).filter((value):value is string=>value!==null));
 const grouped=new Map<string,BackfillProposalOrder[]>();
 for(const candidate of proposal.proposals){const orderNumber=normalizeWorkbookOrderNumber(candidate.orderNumber);if(!orderNumber)continue;const current=grouped.get(orderNumber)??[];current.push(candidate);grouped.set(orderNumber,current);}
 const rows:unknown[][]=[],writtenOrderNumbers:string[]=[];let skippedExistingOrders=0,skippedReviewOrders=0;
 for(const[orderNumber,candidates]of[...grouped.entries()].sort(([left],[right])=>Number(left)-Number(right))){
  if(existing.has(orderNumber)){skippedExistingOrders++;continue;}
  if(candidates.length!==1||candidates[0].classification!=="ready"||!candidates[0].proposedRows.length||candidates[0].proposedRows.some(row=>!rowIsComplete(row))){skippedReviewOrders++;continue;}
  const orderRows=candidates[0].proposedRows.map(valuesFor);
  if(orderRows.some(row=>row[9]!==""||normalizeWorkbookOrderNumber(row[11])!==orderNumber))throw new SalesWorkbookBackfillValidationError("Invalid proposed Sales row");
  rows.push(...orderRows);writtenOrderNumbers.push(orderNumber);existing.add(orderNumber);
 }
 if(!rows.length)return {bytes:sourceBytes,ordersWritten:0,rowsWritten:0,skippedExistingOrders,skippedReviewOrders,writtenOrderNumbers};
 const nonBlankRows=parsed.rows.filter(row=>row.values.some(value=>value!==""));
 const templateRow=(nonBlankRows.at(-1)?.rowNumber??parsed.headerRow)-1;
 const appendAt=templateRow+1;
 XLSX.utils.sheet_add_aoa(sales,rows,{origin:appendAt});
 copyAppendFormatting(sales,templateRow,appendAt,rows.length);
 const output=XLSX.write(workbook,{bookType:"xlsx",type:"array",compression:true});
 return {bytes:new Uint8Array(output),ordersWritten:writtenOrderNumbers.length,rowsWritten:rows.length,skippedExistingOrders,skippedReviewOrders,writtenOrderNumbers};
}
