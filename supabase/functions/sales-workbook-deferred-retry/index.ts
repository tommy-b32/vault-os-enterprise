const response=(body:unknown,status=200)=>Response.json(body,{status});
const same=(left:string,right:string)=>{const a=new TextEncoder().encode(left),b=new TextEncoder().encode(right);if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;};

Deno.serve(async request=>{
  if(request.method!=="POST")return response({success:false,error:"Method not allowed"},405);
  const syncSecret=Deno.env.get("VAULT_ORDER_SYNC_SECRET"),webUrl=Deno.env.get("VAULT_WEB_APP_URL"),workbookSecret=Deno.env.get("SALES_WORKBOOK_AUTOMATION_SECRET");
  if(!syncSecret||!webUrl||!workbookSecret)return response({success:false,error:"Deferred retry configuration unavailable",failure_code:"WORKBOOK_RETRY_CONFIGURATION_UNAVAILABLE"},500);
  if(!same(request.headers.get("x-vault-sync-secret")??"",syncSecret))return response({success:false,error:"Unauthorized"},401);
  try { const result=await fetch(`${webUrl.replace(/\/$/,"")}/api/internal/sales-workbook/deferred-retry`,{method:"POST",headers:{"content-type":"application/json","x-vault-sales-workbook-automation-secret":workbookSecret},signal:AbortSignal.timeout(55000)}); if(!result.ok)throw new Error("WORKBOOK_RETRY_REJECTED"); return response({success:true}); }
  catch { return response({success:false,error:"Deferred workbook retry unavailable",failure_code:"WORKBOOK_RETRY_FAILED"},502); }
});
