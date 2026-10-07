import { NextResponse } from "next/server";
import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { SalesWorkbookOrphanedUploadError } from "@/lib/sales-workbook/types";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";

const MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", MAX=20*1024*1024;
const safeName=(name:string)=>name.replace(/[^A-Za-z0-9._ -]/g,"_").slice(0,255);
async function validate(file:File){
 if(!/\.xlsx$/i.test(file.name)||/\.xlsm$/i.test(file.name))throw new Error("invalid");
 if(file.type!==MIME||file.size<4||file.size>MAX)throw new Error("invalid");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==0x03||bytes[3]!==0x04)throw new Error("invalid");
 if(new TextDecoder().decode(bytes).toLowerCase().includes("vbaproject.bin"))throw new Error("invalid");
 return {bytes,filename:safeName(file.name)};
}
export async function POST(request:Request){
 try{const operator=await requireOperatorRole("owner","operator");const form=await request.formData();const values=form.getAll("workbook");if(values.length!==1||!(values[0] instanceof File))return NextResponse.json({error:"Invalid workbook upload"},{status:400});const upload=await validate(values[0]);if(await SalesWorkbookRepository.getCurrentWorkbook())return NextResponse.json({error:"A managed workbook already exists"},{status:409});const result=await SalesWorkbookRepository.uploadInitialWorkbook({...upload,operatorId:operator.id});return NextResponse.json({success:true,workbook:{id:result.workbook.id,filename:result.workbook.filename,currentVersion:result.workbook.current_version,uploadedAt:result.workbook.uploaded_at,lastModifiedAt:result.workbook.last_modified_at}},{status:201});
 }catch(error){if(error instanceof OperatorAuthorizationError)return NextResponse.json({error:error.reason==="forbidden"?"Forbidden":"Unauthorized"},{status:error.reason==="forbidden"?403:401});if(error instanceof SalesWorkbookOrphanedUploadError){console.error("Sales workbook upload left an orphaned object",{name:error.name});return NextResponse.json({error:"Workbook upload failed"},{status:500});}if(error instanceof Error&&error.message==="invalid")return NextResponse.json({error:"Invalid workbook upload"},{status:400});if(error instanceof Error&&/already exists|conflict/i.test(error.message))return NextResponse.json({error:"A managed workbook already exists"},{status:409});console.error("Sales workbook upload failed",{name:error instanceof Error?error.name:"Unknown"});return NextResponse.json({error:"Workbook upload failed"},{status:500});}
}
