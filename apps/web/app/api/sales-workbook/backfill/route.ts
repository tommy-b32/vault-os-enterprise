import { NextResponse } from "next/server";

import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { getBackfillProposal } from "@/lib/sales-workbook/BackfillProposalService";
import { prepareSalesWorkbookBackfill, SalesWorkbookBackfillValidationError } from "@/lib/sales-workbook/BackfillWriter";
import { SalesWorkbookRepository, sha256 } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { SalesWorkbookConflictError, SalesWorkbookOrphanedUploadError } from "@/lib/sales-workbook/types";

const validVersion=(value:unknown)=>typeof value==="number"&&Number.isInteger(value)&&value>0;
const validChecksum=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);

export async function POST(request:Request){
 try{
  const operator=await requireOperatorRole("owner","operator");
  const body=await request.json().catch(()=>null) as {expectedWorkbookVersion?:unknown;expectedWorkbookChecksum?:unknown}|null;
  if(!body||!validVersion(body.expectedWorkbookVersion)||(body.expectedWorkbookChecksum!==undefined&&!validChecksum(body.expectedWorkbookChecksum)))return NextResponse.json({error:"Invalid backfill request"},{status:400});
  const current=await SalesWorkbookRepository.getCurrentWorkbook();
  if(!current) return NextResponse.json({error:"No managed workbook is available"},{status:409});
  if(current.current_version!==body.expectedWorkbookVersion||(body.expectedWorkbookChecksum!==undefined&&current.content_hash!==body.expectedWorkbookChecksum))throw new SalesWorkbookConflictError(current);
  const {workbook,bytes}=await SalesWorkbookRepository.readCurrentWorkbookBytes();
  if(workbook.id!==current.id||workbook.current_version!==current.current_version||workbook.content_hash!==current.content_hash||sha256(new Uint8Array(bytes))!==current.content_hash)throw new SalesWorkbookConflictError(current);
  const proposal=await getBackfillProposal();
  const prepared=prepareSalesWorkbookBackfill(bytes,proposal);
  if(!prepared.ordersWritten)return NextResponse.json({sourceWorkbookVersion:current.current_version,newWorkbookVersion:current.current_version,ordersWritten:0,rowsWritten:0,skippedExistingOrders:prepared.skippedExistingOrders,skippedReviewOrders:prepared.skippedReviewOrders,writtenOrderNumbers:[]});
  const result=await SalesWorkbookRepository.writeBackfillWorkbook({bytes:prepared.bytes,operatorId:operator.id,current,metadata:{sourceWorkbookVersion:current.current_version,newWorkbookVersion:current.current_version+1,ordersWritten:prepared.ordersWritten,rowsWritten:prepared.rowsWritten,skippedExistingOrders:prepared.skippedExistingOrders,skippedReviewOrders:prepared.skippedReviewOrders,targetOrderRange:proposal.targetOrderRange}});
  return NextResponse.json({sourceWorkbookVersion:current.current_version,newWorkbookVersion:result.workbook.current_version,ordersWritten:prepared.ordersWritten,rowsWritten:prepared.rowsWritten,skippedExistingOrders:prepared.skippedExistingOrders,skippedReviewOrders:prepared.skippedReviewOrders,writtenOrderNumbers:prepared.writtenOrderNumbers});
 }catch(error){
  if(error instanceof OperatorAuthorizationError)return NextResponse.json({error:error.reason==="forbidden"?"Forbidden":"Unauthorized"},{status:error.reason==="forbidden"?403:401});
  if(error instanceof SalesWorkbookConflictError)return NextResponse.json({error:"Sales workbook changed; refresh and try again"},{status:409});
  if(error instanceof SalesWorkbookBackfillValidationError)return NextResponse.json({error:"Sales workbook backfill validation failed"},{status:422});
  if(error instanceof SalesWorkbookOrphanedUploadError){console.error("Sales workbook backfill left an orphaned private object",{name:error.name});return NextResponse.json({error:"Sales workbook backfill failed"},{status:500});}
  console.error("Sales workbook backfill failed",{name:error instanceof Error?error.name:"Unknown"});
  return NextResponse.json({error:"Sales workbook backfill failed"},{status:500});
 }
}
