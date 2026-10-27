import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as XLSX from "xlsx";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");

async function themeHelper(){
 const source=await read("lib/sales-workbook/OoxmlThemePreservation.ts");
 const executable=source.replace('import "server-only";','').replace('import { deflateRawSync, inflateRawSync } from "node:zlib";','const { deflateRawSync, inflateRawSync }=(globalThis as any).__salesWorkbookZlib;');
 const javascript=ts.transpileModule(executable,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 globalThis.__salesWorkbookZlib=await import("node:zlib");
 return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

function workbookBytes(){
 const workbook=XLSX.utils.book_new();const sales=XLSX.utils.aoa_to_sheet([["SALES"],["Product","Sale Price","Cost","Unit COGS","Postage fee","Card Fee","Profit","Posted","Tracking","","date of sale","order number"],["Existing",40,10,12,3,1,{f:"B3-C3"},"Complete","","","5/7/26","1251"]]);
 XLSX.utils.book_append_sheet(workbook,sales,"Sales");XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["costings"]]),"Costings");XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["dashboard"]]),"Dashboard");return new Uint8Array(XLSX.write(workbook,{bookType:"xlsx",type:"array",compression:true}));
}

test("theme preservation carries the source theme byte-for-byte through a SheetJS write",async()=>{
 const {readOriginalSalesWorkbookTheme,restoreOriginalSalesWorkbookTheme}=await themeHelper(),source=workbookBytes(),workbook=XLSX.read(source,{type:"array",cellFormula:true,cellStyles:true,bookVBA:true});
 workbook.Sheets.Sales.B4={t:"n",v:41};workbook.Sheets.Sales.L4={t:"n",v:1252};workbook.Sheets.Sales["!ref"]="A1:L4";
 const serialized=new Uint8Array(XLSX.write(workbook,{bookType:"xlsx",type:"array",compression:true})),restored=restoreOriginalSalesWorkbookTheme(source,serialized),parsed=XLSX.read(restored,{type:"array",cellFormula:true,cellStyles:true,bookVBA:true});
 assert.equal(sha(readOriginalSalesWorkbookTheme(restored)),sha(readOriginalSalesWorkbookTheme(source)));
 assert.equal(parsed.Sheets.Sales.G3.f,"B3-C3");assert.equal(parsed.Sheets.Sales.L4.v,1252);assert.deepEqual(parsed.SheetNames,["Sales","Costings","Dashboard"]);assert.ok(restored.byteLength<=25*1024*1024);
});

test("theme preservation is required before governed backfill serialization",async()=>{
 const writer=await read("lib/sales-workbook/BackfillWriter.ts"),helper=await read("lib/sales-workbook/OoxmlThemePreservation.ts");
 assert.match(writer,/restoreOriginalSalesWorkbookTheme\(sourceBytes,new Uint8Array\(output\)\)/);assert.match(helper,/xl\/theme\/theme1\.xml/);assert.match(helper,/inflateRawSync/);assert.match(helper,/deflateRawSync/);
});

test("pending publication has a fail-closed workbook size limit before storage upload",async()=>{
 const [repository,route,types]=await Promise.all([read("lib/sales-workbook/SalesWorkbookRepository.ts"),read("app/api/internal/sales-workbook/order-ready/route.ts"),read("lib/sales-workbook/types.ts")]);
 assert.match(types,/SALES_WORKBOOK_MAX_BYTES=25\*1024\*1024/);assert.match(repository,/if\(input\.bytes\.byteLength>SALES_WORKBOOK_MAX_BYTES\)throw new SalesWorkbookSizeLimitError/);assert.match(repository,/SalesWorkbookSizeLimitError[\s\S]*storage\.from\(SALES_WORKBOOK_BUCKET\)\.upload/);assert.match(route,/"WORKBOOK_SIZE_LIMIT"/);assert.match(route,/status: 422/);
});

test("oversized pending workbook is rejected before the storage client is reached",async()=>{
 const source=await read("lib/sales-workbook/SalesWorkbookRepository.ts");
 const executable=source.replace(/^import .*\r?\n/,`const productionSupabaseAdmin={};const SALES_WORKBOOK_BUCKET="vault-documents",SALES_WORKBOOK_PREFIX="sales-workbook/versions",XLSX_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",SALES_WORKBOOK_MAX_BYTES=25*1024*1024;class SalesWorkbookConflictError extends Error{}class SalesWorkbookOrphanedUploadError extends Error{}class SalesWorkbookSizeLimitError extends Error{constructor(sizeBytes){super("size");this.name="SalesWorkbookSizeLimitError";this.sizeBytes=sizeBytes;}}`);
 const javascript=ts.transpileModule(executable,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,exports={};
 new Function("exports","createHash","randomUUID",javascript)(exports,createHash,()=>"id");
 let uploads=0;const repository=exports.createSalesWorkbookRepository({storage:{from:()=>({upload:async()=>{uploads++;return{error:null};}})}});
 await assert.rejects(()=>repository.writePendingBackfillWorkbook({bytes:new Uint8Array(25*1024*1024+1),operatorId:"operator",current:{id:"workbook",current_version:22,content_hash:"hash",filename:"sales.xlsx"}}),error=>error?.name==="SalesWorkbookSizeLimitError");
 assert.equal(uploads,0);
});
