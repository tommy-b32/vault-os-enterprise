import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeWorkbookOrderNumber, parseSalesWorkbook } from "./WorkbookParser";
import { prepareSalesWorkbookTrackingRepair, SalesWorkbookTrackingRepairValidationError, verifySalesWorkbookTrackingRepairPreservation } from "./TrackingRepairWriter";

export const TRACKING_REPAIR_APPROVAL={
  workbookId:"c40103e8-bae6-41b2-943e-8ce8c7592470",
  sourceVersion:2,
  sourceSha256:"d0a7b0a93929c4c606b5222e8895166034b7e912da5fa5effe53badadbe69227",
  candidateSha256:"ee350c10674e865da826f30cfcc5d4521eb9b0ac3d2690b29ea6bec303c9cedb",
  ordersUpdated:43,
  rowsUpdated:79,
} as const;

export const TRACKING_REPAIR_TARGET_ORDER_NUMBERS=["1257","1258","1260","1261","1262","1265","1268","1269","1274","1275","1277","1280","1281","1282","1284","1285","1288","1289","1290","1292","1293","1294","1297","1299","1302","1303","1304","1305","1307","1312","1313","1314","1316","1317","1318","1319","1320","1321","1322","1323","1325","1326","1327"] as const;

export async function prepareApprovedTrackingRepair(bytes:ArrayBuffer|Uint8Array){
 const parsed=parseSalesWorkbook(bytes instanceof Uint8Array?Uint8Array.from(bytes).buffer:bytes);
 if(!parsed.valid)throw new SalesWorkbookTrackingRepairValidationError("Sales workbook layout is invalid");
 const {data:orders,error:ordersError}=await supabaseAdmin.from("vault_shopify_orders").select("id,order_number").eq("source","shopify").in("order_number",TRACKING_REPAIR_TARGET_ORDER_NUMBERS);
 if(ordersError||!orders||orders.length!==TRACKING_REPAIR_TARGET_ORDER_NUMBERS.length||new Set(orders.map(order=>order.order_number)).size!==TRACKING_REPAIR_TARGET_ORDER_NUMBERS.length)throw new SalesWorkbookTrackingRepairValidationError("Tracking repair canonical order mapping is incomplete");
 const ids=orders.map(order=>order.id);
 const {data:evidence,error:evidenceError}=await supabaseAdmin.rpc("get_shopify_fulfillment_tracking_for_orders",{p_order_ids:ids});
 if(evidenceError||!evidence)throw new SalesWorkbookTrackingRepairValidationError("Tracking repair evidence is unavailable");
 const orderNumberById=new Map(orders.map(order=>[order.id,normalizeWorkbookOrderNumber(order.order_number)]));
 const trackingByOrder=new Map<string,string[]>();
 for(const item of evidence){const orderNumber=orderNumberById.get(item.order_id);if(!orderNumber||typeof item.tracking_number!=="string"||!item.tracking_number.trim())throw new SalesWorkbookTrackingRepairValidationError("Tracking repair evidence is invalid");const values=trackingByOrder.get(orderNumber)??[];values.push(item.tracking_number);trackingByOrder.set(orderNumber,values);}
 const prepared=prepareSalesWorkbookTrackingRepair(bytes,TRACKING_REPAIR_TARGET_ORDER_NUMBERS,trackingByOrder);
 const targetRows=parsed.rows.filter(row=>row.orderNumber!==null&&TRACKING_REPAIR_TARGET_ORDER_NUMBERS.includes(row.orderNumber as typeof TRACKING_REPAIR_TARGET_ORDER_NUMBERS[number]));
 const allowedRows=new Map<number,string>();
 for(const row of targetRows){const values=[...new Set(trackingByOrder.get(row.orderNumber!)??[])];if(values.length===1)allowedRows.set(row.rowNumber,values[0]);}
 const preservation=verifySalesWorkbookTrackingRepairPreservation(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),prepared.bytes,allowedRows);
 if(targetRows.length!==TRACKING_REPAIR_APPROVAL.rowsUpdated||prepared.eligibleOrderNumbers.length!==TRACKING_REPAIR_APPROVAL.ordersUpdated||prepared.rowsUpdated!==TRACKING_REPAIR_APPROVAL.rowsUpdated||prepared.skippedNoTracking!==0||prepared.skippedAmbiguousTracking!==0||prepared.skippedConflictTracking!==0||!preservation.valid)throw new SalesWorkbookTrackingRepairValidationError("Tracking repair approval checks failed");
 return {prepared,preservation};
}
