import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=await readFile(new URL("../components/purchase-orders/PurchaseOrderProductImage.tsx",import.meta.url),"utf8");
test("image control provides thumbnail, enlarge control and accessible modal",()=>{for(const text of ["purchase-order-thumbnail","Enlarge","role=\"dialog\"","aria-modal=\"true\"","Close","productImageAlt"])assert.match(source,new RegExp(text));assert.match(source,/onClick=\{\(\) => setOpen\(true\)\}/);});
test("image modal closes safely by Close, Escape and backdrop but not content",()=>{assert.match(source,/event\.key === "Escape"/);assert.match(source,/onMouseDown=\{close\}/);assert.match(source,/stopPropagation/);assert.match(source,/trigger\.current\?\.focus/);});
test("missing or failed images show a stable no-image state",()=>{assert.match(source,/!available/);assert.match(source,/NO IMAGE/);assert.match(source,/onError=\{\(\) => setFailed\(true\)\}/);});
