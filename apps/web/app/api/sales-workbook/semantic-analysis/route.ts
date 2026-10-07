import { NextResponse } from "next/server";
import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { parseSalesWorkbook } from "@/lib/sales-workbook/WorkbookParser";
import { analyzeWorkbookSemantics, type SemanticSample } from "@/lib/sales-workbook/WorkbookSemanticAnalyzer";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Order = { id:string; order_number:string; gross_total:number|null; net_revenue:number|null; financial_status:string|null; fulfilment_status:string|null; refunds:number|null; cancelled_at:string|null; metadata:unknown };
type Line = { order_id:string; total_cogs_gbp:number|null; cogs_status:string };
export async function GET() { try {
  await requireOperatorRole("owner", "operator");
  const { bytes } = await SalesWorkbookRepository.readCurrentWorkbookBytes(); const parsed = parseSalesWorkbook(bytes);
  if (!parsed.valid) return NextResponse.json({ error:"Sales workbook layout is invalid" }, { status:422 });
  const groups = new Map<string, typeof parsed.rows>(); for (const row of parsed.rows) if (row.orderNumber) groups.set(row.orderNumber, [...(groups.get(row.orderNumber) ?? []), row]);
  const keys = [...groups.keys()]; const {data:orders,error} = await supabaseAdmin.from("vault_shopify_orders").select("id,order_number,gross_total,net_revenue,financial_status,fulfilment_status,refunds,cancelled_at,metadata").eq("source","shopify").in("order_number",keys);
  if(error||!orders) throw new Error("canonical orders unavailable"); const ids=orders.map(x=>x.id); const {data:lines,error:lineError}=await supabaseAdmin.from("vault_shopify_order_lines").select("order_id,total_cogs_gbp,cogs_status").in("order_id",ids);
  if(lineError||!lines) throw new Error("canonical lines unavailable"); const byOrder=new Map<string,Line[]>(); for(const line of lines as Line[]) byOrder.set(line.order_id,[...(byOrder.get(line.order_id)??[]),line]);
  const samples:SemanticSample[]=[]; for(const order of orders as Order[]){const rows=groups.get(order.order_number), canonical=byOrder.get(order.id)??[]; if(!rows||rows.length!==1||canonical.length!==1||order.cancelled_at||Number(order.refunds)>0||(order.metadata as {test?:unknown})?.test===true)continue; const row=rows[0],line=canonical[0]; samples.push({orderNumber:order.order_number,cost:row.values[2],costAndShip:row.values[3],postage:row.values[4],cardFee:row.values[5],profit:row.values[6],payout:row.values[7],salePrice:row.values[1],governedCogs:line.cogs_status==="trusted"?line.total_cogs_gbp:null,grossTotal:order.gross_total,netRevenue:order.net_revenue,financialStatus:order.financial_status,fulfilmentStatus:order.fulfilment_status});}
  return NextResponse.json({...analyzeWorkbookSemantics(samples),eligibleHistoricalSampleCount:samples.length});
}catch(error){if(error instanceof OperatorAuthorizationError)return NextResponse.json({error:error.reason==="forbidden"?"Forbidden":"Unauthorized"},{status:error.reason==="forbidden"?403:401});console.error("Sales workbook semantic analysis unavailable",{error:error instanceof Error?error.message:"unknown"});return NextResponse.json({error:"Sales workbook semantic analysis is unavailable"},{status:500});}}
