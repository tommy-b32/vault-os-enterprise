import { createClient } from 'npm:@supabase/supabase-js@2';
import { hashPreparedHistoricalC2Items, mapHistoricalC2DryRunResponse } from '../_shared/shopify/historical-c2-reconciliation.ts';
function same(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;}
Deno.serve(async request => {
  if(request.method!=='POST') return Response.json({success:false,error:'METHOD_NOT_ALLOWED'},{status:405});
  const secret=Deno.env.get('VAULT_ORDER_SYNC_SECRET'); if(!secret||!same(request.headers.get('x-vault-sync-secret')??'',secret)) return Response.json({success:false,error:'UNAUTHORIZED'},{status:401});
  try {
    const body=await request.json(); const ids=body?.order_numbers, key=body?.idempotency_key, dryRun=body?.dry_run===true;
    if(!Array.isArray(ids)||ids.length<1) throw new Error('C2_TARGET_ARRAY_EMPTY'); if(ids.length>10) throw new Error('C2_TARGET_COUNT_EXCEEDED');
    if(key!==undefined&&typeof key!=='string') throw new Error('C2_IDEMPOTENCY_KEY_INVALID');
    const url=Deno.env.get('SUPABASE_URL'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SERVICE_ROLE_KEY'); if(!url||!service) throw new Error('C2_STORAGE_UNAVAILABLE');
    const client=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:prepared,error:prepareError}=await client.rpc('prepare_historical_c2_v1',{p_order_numbers:ids,p_dry_run:dryRun,p_idempotency_key:key??null});
    if(prepareError) throw new Error(prepareError.message);
    const hashAttestationItems=prepared.items??[];
    const hashes=hashPreparedHistoricalC2Items(hashAttestationItems);
    if(dryRun) {
      const {data:planRows,error:planError}=await client.from('vault_shopify_historical_c2_prepared_plan_items').select('id,canonical_order_id,canonical_order_line_id,kind,source_observation_id,completeness_observation_id,payload,required_hash,expected_source_fingerprint').eq('run_id',prepared.run_id).order('id',{ascending:true});
      if(planError) throw new Error(planError.message);
      const orderIds=[...new Set((planRows??[]).map((row:any)=>row.canonical_order_id))];
      const {data:orders,error:ordersError}=orderIds.length ? await client.from('vault_shopify_orders').select('id,order_number').in('id',orderIds) : {data:[],error:null};
      if(ordersError) throw new Error(ordersError.message);
      const orderNumbers=new Map((orders??[]).map((order:any)=>[order.id,order.order_number]));
      const fullPlan=(planRows??[]).map((row:any)=>({...row,order_number:orderNumbers.get(row.canonical_order_id)}));
      if(fullPlan.some((row:any)=>typeof row.order_number!=='string')) throw new Error('C2_PLAN_ORDER_LOOKUP_FAILED');
      return Response.json({success:true,...mapHistoricalC2DryRunResponse(prepared,fullPlan),hashes});
    }
    for(const hash of hashes){const {error}=await client.rpc('attest_historical_c2_v1_fingerprint',{p_run_id:prepared.run_id,p_plan_item_id:hash.id,p_fingerprint:hash.fingerprint});if(error)throw new Error(error.message);}
    const {data,error}=await client.rpc('finalize_historical_c2_v1',{p_run_id:prepared.run_id});
    if(error) throw new Error(error.message); return Response.json({success:true,...data});
  } catch(error) { const code=error instanceof Error?error.message:'C2_RECONCILIATION_FAILED'; return Response.json({success:false,error:code},{status:400}); }
});
