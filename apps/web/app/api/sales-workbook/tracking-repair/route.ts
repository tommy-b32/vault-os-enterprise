import { NextResponse } from "next/server";

import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { SalesWorkbookRepository, sha256 } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { TRACKING_REPAIR_APPROVAL, prepareApprovedTrackingRepair } from "@/lib/sales-workbook/TrackingRepairService";
import { SalesWorkbookConflictError, SalesWorkbookOrphanedUploadError } from "@/lib/sales-workbook/types";

const requestIsValid=(value:unknown):value is {expectedWorkbookVersion:number;expectedWorkbookSha256:string}=>typeof value==="object"&&value!==null&&Object.keys(value).length===2&&"expectedWorkbookVersion" in value&&"expectedWorkbookSha256" in value&&typeof value.expectedWorkbookVersion==="number"&&Number.isInteger(value.expectedWorkbookVersion)&&typeof value.expectedWorkbookSha256==="string"&&/^[0-9a-f]{64}$/.test(value.expectedWorkbookSha256);
const response=(currentVersion:number,alreadyApplied=false)=>NextResponse.json({success:true,sourceWorkbookVersion:TRACKING_REPAIR_APPROVAL.sourceVersion,newWorkbookVersion:3,ordersUpdated:TRACKING_REPAIR_APPROVAL.ordersUpdated,rowsUpdated:TRACKING_REPAIR_APPROVAL.rowsUpdated,sha256:TRACKING_REPAIR_APPROVAL.candidateSha256,currentVersion,...(alreadyApplied?{alreadyApplied:true}:{})});

export async function POST(request:Request){
 try{
  const operator=await requireOperatorRole("owner","operator");
  const body=await request.json().catch(()=>null);
  if(!requestIsValid(body))return NextResponse.json({error:"Invalid tracking repair request"},{status:400});
  if(body.expectedWorkbookVersion!==TRACKING_REPAIR_APPROVAL.sourceVersion||body.expectedWorkbookSha256!==TRACKING_REPAIR_APPROVAL.sourceSha256)return NextResponse.json({error:"Sales workbook changed; refresh and try again"},{status:409});
  const current=await SalesWorkbookRepository.getCurrentWorkbook();
  if(!current)return NextResponse.json({error:"No managed workbook is available"},{status:409});
  if(current.id!==TRACKING_REPAIR_APPROVAL.workbookId)return NextResponse.json({error:"Sales workbook changed; refresh and try again"},{status:409});
  if(current.current_version===3){if(current.content_hash!==TRACKING_REPAIR_APPROVAL.candidateSha256)return NextResponse.json({error:"Sales workbook changed; refresh and try again"},{status:409});return response(current.current_version,true);}
  if(current.current_version!==body.expectedWorkbookVersion||current.content_hash!==body.expectedWorkbookSha256)throw new SalesWorkbookConflictError(current);
  const {workbook,bytes}=await SalesWorkbookRepository.readCurrentWorkbookBytes();
  const sourceBytes=new Uint8Array(bytes);
  if(workbook.id!==current.id||workbook.current_version!==current.current_version||workbook.content_hash!==current.content_hash||sha256(sourceBytes)!==current.content_hash||sha256(sourceBytes)!==body.expectedWorkbookSha256)throw new SalesWorkbookConflictError(current);
  const {prepared}=await prepareApprovedTrackingRepair(sourceBytes);
  const candidateSha256=sha256(prepared.bytes);
  if(candidateSha256!==TRACKING_REPAIR_APPROVAL.candidateSha256)throw new Error("Tracking repair candidate checksum mismatch");
  const result=await SalesWorkbookRepository.writeTrackingRepairWorkbook({bytes:prepared.bytes,operatorId:operator.id,current,metadata:{sourceWorkbookVersion:2,newWorkbookVersion:3,ordersUpdated:43,rowsUpdated:79,skippedNoTracking:prepared.skippedNoTracking,skippedAmbiguousTracking:prepared.skippedAmbiguousTracking,skippedConflictTracking:prepared.skippedConflictTracking,source:"governed_shopify_fulfillment_tracking"}});
  return response(result.workbook.current_version);
 }catch(error){
  if(error instanceof OperatorAuthorizationError)return NextResponse.json({error:error.reason==="forbidden"?"Forbidden":"Unauthorized"},{status:error.reason==="forbidden"?403:401});
  if(error instanceof SalesWorkbookConflictError)return NextResponse.json({error:"Sales workbook changed; refresh and try again"},{status:409});
  if(error instanceof SalesWorkbookOrphanedUploadError){console.error("Sales workbook tracking repair left an orphaned private object",{name:error.name,orphanPath:error.orphanPath});return NextResponse.json({error:"Sales workbook tracking repair failed"},{status:500});}
  console.error("Sales workbook tracking repair failed",{name:error instanceof Error?error.name:"Unknown"});
  return NextResponse.json({error:"Sales workbook tracking repair failed"},{status:500});
 }
}
