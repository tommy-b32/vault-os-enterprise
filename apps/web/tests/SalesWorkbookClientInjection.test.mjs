import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("Sales Workbook repository factory uses its supplied client",async()=>{
 const source=await readFile(new URL("../lib/sales-workbook/SalesWorkbookRepository.ts",import.meta.url),"utf8"),exports={};
 const compiled=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,""),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const hash=()=>({update:()=>({digest:()=>"x"})});class Conflict extends Error{} class Orphan extends Error{}
 new Function("exports","createHash","randomUUID","productionSupabaseAdmin","SALES_WORKBOOK_BUCKET","SALES_WORKBOOK_PREFIX","XLSX_MIME","SalesWorkbookConflictError","SalesWorkbookOrphanedUploadError",compiled)(exports,hash,()=>"id",{},"bucket","prefix","mime",Conflict,Orphan);
 let selected=false;const client={from:table=>({select:()=>({order:()=>({limit:()=>({maybeSingle:async()=>{selected=table==="vault_sales_workbooks";return{data:null,error:null};}})})})})};
 await exports.createSalesWorkbookRepository(client).getCurrentWorkbook();assert.equal(selected,true);
});

test("proposal accepts an explicit internal client while keeping its production default",async()=>{
 const source=await readFile(new URL("../lib/sales-workbook/BackfillProposalService.ts",import.meta.url),"utf8");
 assert.match(source,/supabaseAdmin:typeof productionSupabaseAdmin=productionSupabaseAdmin/);
 assert.match(source,/await supabaseAdmin\.from\("vault_shopify_orders"\)/);
});
