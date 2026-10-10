import { createClient } from 'npm:@supabase/supabase-js@2';
import { hashPreparedHistoricalC2Items } from '../_shared/shopify/historical-c2-reconciliation.ts';
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
    const hashes=hashPreparedHistoricalC2Items(prepared.items??[]);
    if(dryRun) return Response.json({success:true,...prepared,hashes});
    for(const hash of hashes){const {error}=await client.rpc('attest_historical_c2_v1_fingerprint',{p_run_id:prepared.run_id,p_plan_item_id:hash.id,p_fingerprint:hash.fingerprint});if(error)throw new Error(error.message);}
    const {data,error}=await client.rpc('finalize_historical_c2_v1',{p_run_id:prepared.run_id});
    if(error) throw new Error(error.message); return Response.json({success:true,...data});
  } catch(error) { const code=error instanceof Error?error.message:'C2_RECONCILIATION_FAILED'; return Response.json({success:false,error:code},{status:400}); }
});
