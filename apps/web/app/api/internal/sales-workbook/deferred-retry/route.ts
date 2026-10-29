import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runOrderReadyWorkbookWorker } from "@/lib/sales-workbook/OrderReadyWorkbookWorker";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

const same=(provided:string|null,configured:string|undefined)=>{if(!provided||!configured)return false;const a=Buffer.from(provided),b=Buffer.from(configured);return a.length===b.length&&timingSafeEqual(a,b);};
const MAX_RETRY_ORDERS=25;
type DeferredRetryDependencies={runWorker:typeof runOrderReadyWorkbookWorker;repository:Pick<typeof SalesWorkbookRepository,"recordAutomaticSyncOutcome">;supabase:typeof supabaseAdmin};
const productionDependencies:DeferredRetryDependencies={runWorker:runOrderReadyWorkbookWorker,repository:SalesWorkbookRepository,supabase:supabaseAdmin};
type ClaimedOrderReadyRequest={id:string;order_number:string;lease_token:string;attempt_count:number};

async function processApprovedCogsRequests(dependencies:DeferredRetryDependencies){
 const claimed=await dependencies.supabase.rpc("claim_sales_workbook_order_ready_requests",{p_limit:MAX_RETRY_ORDERS});
 if(claimed.error)throw new Error("Approved COGS workbook request queue unavailable");
 let completed=0,retried=0;
 for(const request of (claimed.data??[]) as ClaimedOrderReadyRequest[]){
  try{
   // One approval request invokes the existing worker for that one canonical
   // order. The worker retains all financial-evidence and duplicate-row gates.
   const result=await dependencies.runWorker([request.order_number]);
   const deferred=result.deferredOrderNumbers.includes(request.order_number);
   const settled=deferred
    ? await dependencies.supabase.rpc("retry_sales_workbook_order_ready_request",{p_request_id:request.id,p_lease_token:request.lease_token,p_error_code:"WORKBOOK_ORDER_NOT_READY"})
    : await dependencies.supabase.rpc("complete_sales_workbook_order_ready_request",{p_request_id:request.id,p_lease_token:request.lease_token});
   if(settled.error)throw new Error("Approved COGS workbook request lease lost");
   if(deferred)retried++;else completed++;
  }catch{
   // The lease token prevents a late or duplicate worker from settling a newer
   // claim. A failed attempt remains durable and is retried with backoff.
   const retriedRequest=await dependencies.supabase.rpc("retry_sales_workbook_order_ready_request",{p_request_id:request.id,p_lease_token:request.lease_token,p_error_code:"WORKBOOK_ORDER_READY_FAILED"});
   if(retriedRequest.error)throw new Error("Approved COGS workbook request retry unavailable");
   retried++;
  }
 }
 return {claimed:(claimed.data??[]).length,completed,retried};
}

export function createDeferredRetryHandler(dependencies:DeferredRetryDependencies=productionDependencies){return async function POST(request:Request){
 if(!same(request.headers.get("x-vault-sales-workbook-automation-secret"),process.env.SALES_WORKBOOK_AUTOMATION_SECRET))return NextResponse.json({error:"Unauthorized"},{status:401});
 let approvedCogs;
 try{approvedCogs=await processApprovedCogsRequests(dependencies);}catch{return NextResponse.json({error:"Approved COGS workbook request queue unavailable"},{status:500});}
 const{data,error}=await dependencies.supabase.from("vault_sales_workbook_deferred_orders").select("order_number").lte("next_retry_at",new Date().toISOString()).order("next_retry_at").limit(MAX_RETRY_ORDERS);
 if(error)return NextResponse.json({error:"Deferred workbook queue unavailable"},{status:500});
 const orderNumbers=(data??[]).map(row=>row.order_number);if(!orderNumbers.length)return NextResponse.json({status:"deferred",processed:0,approvedCogs});
 try{const result=await dependencies.runWorker(orderNumbers),status=result.ordersWritten>0?"published":"deferred";await dependencies.repository.recordAutomaticSyncOutcome({orderNumbers,status,publishedOrderNumbers:result.writtenOrderNumbers,deferredReasons:result.deferredReasons});return NextResponse.json({...result,status});}
 catch{await dependencies.repository.recordAutomaticSyncOutcome({orderNumbers,status:"failed",errorCode:"WORKBOOK_RETRY_FAILED"});return NextResponse.json({error:"Deferred workbook retry failed"},{status:500});}
}};
export const POST=createDeferredRetryHandler();
