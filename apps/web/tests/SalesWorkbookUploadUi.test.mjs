import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const root=new URL("../",import.meta.url);
test("sales workbook UI loads safe existing-workbook metadata and preserves read-only viewer controls",async()=>{const ui=await readFile(new URL("components/operations/SalesWorkbookUpload.tsx",root),"utf8");for(const text of["useEffect","fetch(\"/api/sales-workbook\")","Checking managed workbook","setStored(p.workbook)","Workbook status is unavailable. Please try again.","stored?\"Stored securely\":\"Upload the first workbook\"","View Sales","fetch(\"/api/sales-workbook/view\")","body.append(\"workbook\"","accept=\".xlsx","[25,50,100]","setQuery(e.target.value)","setPayout(e.target.value)","[0,1,2,3,4,5,6,7,8,10,11]"])assert.ok(ui.includes(text));assert.doesNotMatch(ui,/storage\.from|createSignedUrl|contentEditable|save|delete|update/);});
