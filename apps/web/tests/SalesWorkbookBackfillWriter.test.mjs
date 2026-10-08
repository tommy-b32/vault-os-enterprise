import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as XLSX from "xlsx";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");
const normalize=value=>{const text=String(value??"").trim().replace(/^#/,"");return /^\d+$/.test(text)&&Number(text)>0?text.replace(/^0+(?=\d)/,""):null;};
const parse=bytes=>{const workbook=XLSX.read(bytes,{type:"array"}),sheet=workbook.Sheets.Sales;if(!sheet)return{valid:false};const data=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:""});return{valid:true,headerRow:2,rows:data.slice(2).map((cells,index)=>({rowNumber:index+3,values:Array.from({length:12},(_,column)=>String(cells[column]??"")),orderNumber:normalize(cells[11])}))};};
async function writer(){const source=await read("lib/sales-workbook/BackfillWriter.ts");const executable=source.replace('import "server-only";','').replace('import * as XLSX from "xlsx";','const XLSX=(globalThis as any).__salesWorkbookXlsx;').replace(/import \{ type BackfillProposalOrder, type ProposalField, type ProposedWorkbookRow \} from "\.\/BackfillProposal";/,'').replace(/import \{ normalizeWorkbookOrderNumber, parseSalesWorkbook \} from "\.\/WorkbookParser";/,'const normalizeWorkbookOrderNumber=(globalThis as any).__salesWorkbookNormalize; const parseSalesWorkbook=(globalThis as any).__salesWorkbookParse;');globalThis.__salesWorkbookXlsx=XLSX;globalThis.__salesWorkbookNormalize=normalize;globalThis.__salesWorkbookParse=parse;const javascript=ts.transpileModule(executable,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);}
const proven=value=>({value,status:"proven",source:"fixture"});
const unresolved=()=>({value:null,status:"unresolved",source:"fixture"});
const row=(orderNumber="1252",overrides={})=>({product:proven("Product"),salePrice:proven(40),cost:proven(10),costAndShip:proven(12),postageFee:proven(3),cardFee:proven(1),profit:proven(24),posted:proven("Complete"),tracking:{value:"",status:"not_applicable",source:"fixture"},blankColumnJ:proven(""),dateOfSale:proven("5/7/26"),orderNumber:proven(orderNumber),...overrides});
const candidate=(orderNumber="1252",rows=[row(orderNumber)],classification="ready")=>({orderNumber,classification,issues:[],proposedRows:rows});
const proposal=(proposals,sourceComplete=true,excludedExistingOrderCount=0)=>({targetOrderRange:"1251-1329",sourceComplete,proposals,excludedExistingOrderCount});
function workbookBytes(){const workbook=XLSX.utils.book_new();const sales=XLSX.utils.aoa_to_sheet([["SALES"],["Product","Sale Price","Cost","Unit COGS","Postage fee","Card Fee","Profit","Posted","Tracking","","date of sale","order number"],["Existing",40,10,12,3,1,24,"Complete","","","5/7/26","1251"]]);const costings=XLSX.utils.aoa_to_sheet([["costings untouched"],[1,2,3]]),dashboard=XLSX.utils.aoa_to_sheet([["dashboard untouched"],["formula",42]]);XLSX.utils.book_append_sheet(workbook,sales,"Sales");XLSX.utils.book_append_sheet(workbook,costings,"Costings");XLSX.utils.book_append_sheet(workbook,dashboard,"Dashboard");return new Uint8Array(XLSX.write(workbook,{bookType:"xlsx",type:"array"}));}
const sheetData=(bytes,name)=>XLSX.utils.sheet_to_json(XLSX.read(bytes,{type:"array",raw:true}).Sheets[name],{header:1,raw:true,defval:""});

test("ready single and multi-row orders append only to Sales with numeric money and blank J",async()=>{const{prepareSalesWorkbookBackfill}=await writer(),before=workbookBytes(),costings=sheetData(before,"Costings"),dashboard=sheetData(before,"Dashboard");const result=prepareSalesWorkbookBackfill(before,proposal([candidate("1252"),candidate("1253",[row("1253"),row("1253",{product:proven("Second")})])]));assert.deepEqual(result.writtenOrderNumbers,["1252","1253"]);assert.equal(result.ordersWritten,2);assert.equal(result.rowsWritten,3);const sales=sheetData(result.bytes,"Sales");assert.equal(sales.length,6);assert.equal(sales[3][9],"");assert.equal(typeof sales[3][1],"number");assert.deepEqual(sheetData(result.bytes,"Costings"),costings);assert.deepEqual(sheetData(result.bytes,"Dashboard"),dashboard);});

test("one proven governed tracking number is appended to every row of order 1329",async()=>{const{prepareSalesWorkbookBackfill}=await writer(),before=workbookBytes(),costings=sheetData(before,"Costings"),dashboard=sheetData(before,"Dashboard"),tracking=proven("VU733316090GB");const result=prepareSalesWorkbookBackfill(before,proposal([candidate("1329",[row("1329",{tracking}),row("1329",{product:proven("Second"),tracking})])])),sales=sheetData(result.bytes,"Sales");assert.deepEqual(result.writtenOrderNumbers,["1329"]);assert.equal(result.rowsWritten,2);assert.equal(sales[3][8],"VU733316090GB");assert.equal(sales[4][8],"VU733316090GB");assert.deepEqual(sheetData(result.bytes,"Costings"),costings);assert.deepEqual(sheetData(result.bytes,"Dashboard"),dashboard);});

test("review, unresolved, duplicate and existing order groups are skipped whole and reruns are idempotent",async()=>{const{prepareSalesWorkbookBackfill}=await writer(),before=workbookBytes();const unresolvedReady=candidate("1253",[row("1253",{cardFee:unresolved()})]),result=prepareSalesWorkbookBackfill(before,proposal([candidate("1251"),candidate("1252",[row("1252")],"requires_review"),unresolvedReady,candidate("1254"),candidate("1254")]));assert.equal(result.ordersWritten,0);assert.equal(result.skippedExistingOrders,1);assert.equal(result.skippedReviewOrders,3);const first=prepareSalesWorkbookBackfill(before,proposal([candidate("1252")]));const rerun=prepareSalesWorkbookBackfill(first.bytes,proposal([candidate("1252")]));assert.equal(rerun.ordersWritten,0);assert.equal(rerun.skippedExistingOrders,1);});

test("orders excluded before canonical evidence lookup remain represented as skipped existing orders",async()=>{const{prepareSalesWorkbookBackfill}=await writer(),result=prepareSalesWorkbookBackfill(workbookBytes(),proposal([candidate("1329",[row("1329"),row("1329",{product:proven("Second")})])],true,43));assert.deepEqual(result.writtenOrderNumbers,["1329"]);assert.equal(result.rowsWritten,2);assert.equal(result.skippedExistingOrders,43);});

test("incomplete canonical sources fail closed before any serialized workbook is returned",async()=>{const{prepareSalesWorkbookBackfill,SalesWorkbookBackfillValidationError}=await writer();assert.throws(()=>prepareSalesWorkbookBackfill(workbookBytes(),proposal([candidate("1252")],false)),SalesWorkbookBackfillValidationError);});

test("writer is proposal-driven, appends whole ready orders, and remains idempotent",async()=>{
 const source=await read("lib/sales-workbook/BackfillWriter.ts");
 for(const text of["proposal.sourceComplete","classification!==\"ready\"","candidates.length!==1","existing.has(orderNumber)","existing.add(orderNumber)","proposedRows.some(row=>!rowIsComplete(row))","writtenOrderNumbers"])assert.ok(source.includes(text));
 assert.doesNotMatch(source,/supabaseAdmin|fetch\(|vault_shopify_orders/);
});

test("writer modifies Sales only, keeps J blank, and writes monetary cells as numbers",async()=>{
 const source=await read("lib/sales-workbook/BackfillWriter.ts");
 for(const text of["workbook.Sheets.Sales","sheet_add_aoa(sales,rows","row[9]!==\"\"","moneyColumns","typeof cell.v!==\"number\"","cellFormula:true","cellStyles:true"])assert.ok(source.includes(text));
 assert.doesNotMatch(source,/Sheets\.Costings\s*=|Sheets\.Dashboard\s*=|book_append_sheet|writeFile/);
});

test("backfill route requires operator authorization and guards version/checksum before immutable promotion",async()=>{
 const [route,repository]=await Promise.all([read("app/api/sales-workbook/backfill/route.ts"),read("lib/sales-workbook/SalesWorkbookRepository.ts")]);
 for(const text of["requireOperatorRole(\"owner\",\"operator\")","expectedWorkbookVersion","expectedWorkbookChecksum","getCurrentWorkbook","readCurrentWorkbookBytes","sha256(new Uint8Array(bytes))","getBackfillProposal","prepareSalesWorkbookBackfill","writeBackfillWorkbook","SalesWorkbookOrphanedUploadError"])assert.ok(route.includes(text));
 for(const text of["eventType:\"backfill_ready_sales_orders\"","audit_event_type:versionAudit.eventType","backfill_audit_metadata:versionAudit.metadata","upsert:false","SalesWorkbookOrphanedUploadError"])assert.ok(repository.includes(text));
});

test("no ready rows means no version promotion and the response remains safe",async()=>{
 const route=await read("app/api/sales-workbook/backfill/route.ts");
 assert.match(route,/if\(!prepared\.ordersWritten\)return NextResponse\.json/);
 assert.doesNotMatch(route,/storage_path|signedUrl|SUPABASE_SECRET_KEY/);
});
