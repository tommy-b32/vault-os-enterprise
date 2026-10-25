import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runOrderReadyWorkbookWorker, SalesWorkbookWorkerFailure } from "@/lib/sales-workbook/OrderReadyWorkbookWorker";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { SalesWorkbookConflictError } from "@/lib/sales-workbook/types";

const sameSecret = (provided: string | null, configured: string | undefined) => {
  if (!provided || !configured) return false;
  const left = Buffer.from(provided), right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
};

type OrderReadyDependencies={runWorker:typeof runOrderReadyWorkbookWorker;repository:Pick<typeof SalesWorkbookRepository,"recordAutomaticSyncOutcome">};
const productionDependencies:OrderReadyDependencies={runWorker:runOrderReadyWorkbookWorker,repository:SalesWorkbookRepository};
type OrderReadyWorkerSummary={workbookAvailable:boolean;sourceWorkbookVersion?:number;newWorkbookVersion?:number;ordersWritten:number;rowsWritten:number;skippedExistingOrders?:number;skippedReviewOrders?:number;writtenOrderNumbers:string[];deferredOrderNumbers:string[];deferredReasons:Record<string,string[]>};

function compactWorkerResponse(result:OrderReadyWorkerSummary,status:"published"|"deferred") {
  return {
    status,
    workbookAvailable:result.workbookAvailable,
    ...(result.sourceWorkbookVersion===undefined?{}:{sourceWorkbookVersion:result.sourceWorkbookVersion}),
    ...(result.newWorkbookVersion===undefined?{}:{newWorkbookVersion:result.newWorkbookVersion}),
    ordersWritten:result.ordersWritten,
    rowsWritten:result.rowsWritten,
    skippedExistingOrders:result.skippedExistingOrders??0,
    skippedReviewOrders:result.skippedReviewOrders??0,
    writtenOrderNumbers:result.writtenOrderNumbers,
    deferredOrderNumbers:result.deferredOrderNumbers,
    deferredReasons:result.deferredReasons,
  };
}

export function createOrderReadyHandler(dependencies:OrderReadyDependencies=productionDependencies){return async function POST(request: Request) {
  if (!sameSecret(request.headers.get("x-vault-sales-workbook-automation-secret"), process.env.SALES_WORKBOOK_AUTOMATION_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { orderNumbers?: unknown } | null;
  if (!body || !Array.isArray(body.orderNumbers) || !body.orderNumbers.every(value => typeof value === "string" || typeof value === "number")) return NextResponse.json({ error: "Invalid affected order scope" }, { status: 400 });
  try {
    const orderNumbers=body.orderNumbers.map(String),result=await dependencies.runWorker(orderNumbers);
    const status=result.ordersWritten>0?"published":"deferred";
    await dependencies.repository.recordAutomaticSyncOutcome({orderNumbers,status,publishedOrderNumbers:result.writtenOrderNumbers,deferredReasons:result.deferredReasons});
    return NextResponse.json(compactWorkerResponse(result,status));
  } catch (error) {
    try { await dependencies.repository.recordAutomaticSyncOutcome({orderNumbers:body.orderNumbers.map(String),status:"failed",errorCode:error instanceof SalesWorkbookConflictError?"WORKBOOK_CONFLICT":"WORKBOOK_WORKER_FAILED",failureStage:error instanceof SalesWorkbookWorkerFailure?error.stage:undefined}); } catch { console.error("Sales workbook outcome recording failed"); }
    if (error instanceof SalesWorkbookConflictError) return NextResponse.json({ error: "Sales workbook changed; event may be retried" }, { status: 409 });
    console.error("Sales workbook order-ready worker failed", { name: error instanceof Error ? error.name : "Unknown" });
    return NextResponse.json({ error: "Sales workbook order-ready worker failed" }, { status: 500 });
  }};}
export const POST=createOrderReadyHandler();
