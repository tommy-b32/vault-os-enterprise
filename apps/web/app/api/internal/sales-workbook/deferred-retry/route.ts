import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runOrderReadyWorkbookWorker } from "@/lib/sales-workbook/OrderReadyWorkbookWorker";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

const same=(provided:string|null,configured:string|undefined)=>{if(!provided||!configured)return false;const a=Buffer.from(provided),b=Buffer.from(configured);return a.length===b.length&&timingSafeEqual(a,b);};
const MAX_RETRY_ORDERS=25;
type DeferredRetryDependencies={runWorker:typeof runOrderReadyWorkbookWorker;repository:Pick<typeof SalesWorkbookRepository,"recordAutomaticSyncOutcome">;supabase:typeof supabaseAdmin};
const productionDependencies:DeferredRetryDependencies={runWorker:runOrderReadyWorkbookWorker,repository:SalesWorkbookRepository,supabase:supabaseAdmin};
export function createDeferredRetryHandler(dependencies:DeferredRetryDependencies=productionDependencies){return async function POST(request:Request){
 if(!same(request.headers.get("x-vault-sales-workbook-automation-secret"),process.env.SALES_WORKBOOK_AUTOMATION_SECRET))return NextResponse.json({error:"Unauthorized"},{status:401});
 const{data,error}=await dependencies.supabase.from("vault_sales_workbook_deferred_orders").select("order_number").lte("next_retry_at",new Date().toISOString()).order("next_retry_at").limit(MAX_RETRY_ORDERS);
 if(error)return NextResponse.json({error:"Deferred workbook queue unavailable"},{status:500});
 const orderNumbers=(data??[]).map(row=>row.order_number);if(!orderNumbers.length)return NextResponse.json({status:"deferred",processed:0});
 try{const result=await dependencies.runWorker(orderNumbers),status=result.ordersWritten>0?"published":"deferred";await dependencies.repository.recordAutomaticSyncOutcome({orderNumbers,status,publishedOrderNumbers:result.writtenOrderNumbers,deferredReasons:result.deferredReasons});return NextResponse.json({...result,status});}
 catch{await dependencies.repository.recordAutomaticSyncOutcome({orderNumbers,status:"failed",errorCode:"WORKBOOK_RETRY_FAILED"});return NextResponse.json({error:"Deferred workbook retry failed"},{status:500});}
}};
export const POST=createDeferredRetryHandler();
