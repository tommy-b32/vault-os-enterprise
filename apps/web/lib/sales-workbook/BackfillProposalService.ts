import "server-only";

import { buildBackfillProposal, type BackfillProposalLineInput, type ProposalField } from "./BackfillProposal";
import { backfillCandidateScope } from "./BackfillProposalScope";
import { governedTrackingFieldsByOrder, type GovernedFulfilmentTrackingEvidence } from "./GovernedTracking";
import { supabaseAdmin } from "@/lib/supabase-admin";

const unresolved=<T,>(source:string):ProposalField<T>=>({value:null,status:"unresolved",source});
const proven=<T,>(value:T,source:string):ProposalField<T>=>({value,status:"proven",source});
const money=(value:unknown,source:string):ProposalField<number>=>{const number=Number(value);return Number.isFinite(number)&&number>=0?proven(number,source):unresolved(`${source}_unavailable`);};
type CanonicalOrder={id:string;order_number:string;shopify_created_at:string;financial_status:string|null;fulfilment_status:string|null;cancelled_at:string|null;refunds:number|string;metadata:unknown};
type CanonicalLine={id:string;order_id:string;title:string;total_cogs_gbp:number|string|null;unit_cogs_gbp:number|string|null;cogs_status:string;cogs_history_id:string|null;cogs_snapshotted_at:string|null};
type VerifiedAllocation={order_line_id:string;allocated_shipping_cost_gbp:number|string;allocated_payment_fees_gbp:number|string};
type ResolvedLineRevenue={order_line_id:string;resolved_net_line_revenue:number|string|null;resolution_status:string;evidence_method:string};
const query=<T,>(response:{data:T[]|null;error:unknown})=>{const{data,error}=response;if(error||data===null)throw new Error("Canonical Sales Workbook proposal evidence is unavailable");return data;};

export async function getBackfillProposal({existingWorkbookOrderNumbers}: {existingWorkbookOrderNumbers?: Iterable<string>} = {}){
 const scope=backfillCandidateScope(existingWorkbookOrderNumbers);
 if(!scope.candidateOrderNumbers.length)return {...buildBackfillProposal([]),sourceComplete:true,excludedExistingOrderCount:scope.excludedExistingOrderCount,trustedUnitCogsRowCount:0,unresolvedUnitCogsRowCount:0,profitResolvedRowCount:0,profitUnresolvedRowCount:0};
 const orders=query<CanonicalOrder>(await supabaseAdmin.from("vault_shopify_orders").select("id,shopify_order_id,order_number,shopify_created_at,financial_status,fulfilment_status,cancelled_at,refunds,metadata").eq("source","shopify").in("order_number",scope.candidateOrderNumbers).order("order_number",{ascending:true}));
 const orderIds=orders.map(order=>order.id);
 if(!orderIds.length)return {...buildBackfillProposal([]),sourceComplete:scope.candidateOrderNumbers.length===0,excludedExistingOrderCount:scope.excludedExistingOrderCount,trustedUnitCogsRowCount:0,unresolvedUnitCogsRowCount:0,profitResolvedRowCount:0,profitUnresolvedRowCount:0};
 const[lines,allocations,revenues,trackingEvidence]=await Promise.all([
  query<CanonicalLine>(await supabaseAdmin.from("vault_shopify_order_lines").select("id,order_id,title,total_cogs_gbp,unit_cogs_gbp,cogs_status,cogs_history_id,cogs_snapshotted_at").in("order_id",orderIds).order("id",{ascending:true})),
  query<VerifiedAllocation>(await supabaseAdmin.rpc("get_verified_product_profitability_allocations_for_orders",{p_order_ids:orderIds})),
  query<ResolvedLineRevenue>(await supabaseAdmin.from("vault_shopify_resolved_line_discount_evidence").select("order_line_id,resolved_net_line_revenue,resolution_status,evidence_method").in("order_id",orderIds)),
  query<GovernedFulfilmentTrackingEvidence>(await supabaseAdmin.rpc("get_shopify_fulfillment_tracking_for_orders",{p_order_ids:orderIds})),
 ]);
 const allocationByLine=new Map(allocations.map(allocation=>[allocation.order_line_id,allocation]));
 const revenueByLine=new Map(revenues.map(revenue=>[revenue.order_line_id,revenue]));
 const trackingByOrder=governedTrackingFieldsByOrder(orderIds,trackingEvidence);
 const linesByOrder=new Map<string,BackfillProposalLineInput[]>();
 for(const line of lines){const allocation=allocationByLine.get(line.id),revenue=revenueByLine.get(line.id),cogsProven=line.cogs_status==="trusted"&&line.cogs_history_id&&line.cogs_snapshotted_at&&Number.isFinite(Number(line.total_cogs_gbp));const proposalLine:BackfillProposalLineInput={product:typeof line.title==="string"&&line.title.trim()?proven(line.title,"canonical_shopify_order_line_title"):unresolved("canonical_shopify_order_line_title_unavailable"),salePrice:revenue&&revenue.resolution_status!=="unresolved"?money(revenue.resolved_net_line_revenue,`governed_resolved_line_revenue:${revenue.evidence_method}`):unresolved("governed_resolved_line_revenue_unavailable"),cost:cogsProven?money(line.total_cogs_gbp,"governed_sale_time_variant_cogs"):unresolved("governed_sale_time_variant_cogs_unavailable"),costAndShip:cogsProven&&line.unit_cogs_gbp!==null?money(line.unit_cogs_gbp,"governed_sale_time_unit_cogs"):unresolved("governed_sale_time_unit_cogs_unavailable"),postageFee:allocation?money(allocation.allocated_shipping_cost_gbp,"governed_verified_line_shipping_allocation"):unresolved("governed_verified_line_shipping_allocation_unavailable"),cardFee:allocation?money(allocation.allocated_payment_fees_gbp,"governed_verified_line_payment_fee_allocation"):unresolved("governed_verified_line_payment_fee_allocation_unavailable"),tracking:trackingByOrder.get(line.order_id)??unresolved("governed_shopify_fulfillment_tracking_unavailable")};const current=linesByOrder.get(line.order_id)??[];current.push(proposalLine);linesByOrder.set(line.order_id,current);}
 const proposal=buildBackfillProposal(orders.filter(order=>(order.metadata as {test?:unknown}|null)?.test!==true).map(order=>({orderNumber:order.order_number,createdAt:order.shopify_created_at,refunded:Number(order.refunds)>0||/refund/i.test(String(order.financial_status??"")),cancelled:Boolean(order.cancelled_at),financiallyUnusual:/cancel|void|partial/i.test(String(order.financial_status??"")),fulfilmentStatus:order.fulfilment_status,lines:linesByOrder.get(order.id)??[]})));
 const proposalRows=proposal.proposals.flatMap(item=>item.proposedRows),trustedUnitCogsRowCount=proposalRows.filter(row=>row.costAndShip.status==="proven").length,profitResolvedRowCount=proposalRows.filter(row=>row.profit.status==="proven").length;
 return {...proposal,sourceComplete:proposal.proposalOrderCount===scope.candidateOrderNumbers.length,excludedExistingOrderCount:scope.excludedExistingOrderCount,trustedUnitCogsRowCount,unresolvedUnitCogsRowCount:proposalRows.length-trustedUnitCogsRowCount,profitResolvedRowCount,profitUnresolvedRowCount:proposalRows.length-profitResolvedRowCount};
}
