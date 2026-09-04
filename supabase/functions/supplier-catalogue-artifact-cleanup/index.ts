import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "supplier-catalogue-temporary";
const PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: "Required configuration is unavailable" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const completedBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const failedBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [completedResult, failedResult] = await Promise.all([
    supabase.from("vault_supplier_catalogue_archives").select("id,status")
      .in("status", ["completed", "superseded"]).lt("updated_at", completedBefore).limit(100),
    supabase.from("vault_supplier_catalogue_archives").select("id,status")
      .eq("status", "failed").lt("updated_at", failedBefore).limit(100),
  ]);
  if (completedResult.error || failedResult.error) return Response.json({ error: "Catalogue artifact candidates could not be loaded" }, { status: 500 });

  const archives = [...(completedResult.data ?? []), ...(failedResult.data ?? [])];
  let objectsRemoved = 0;
  for (const archive of archives) {
    const objectPaths: string[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.storage.from(BUCKET).list(archive.id, { limit: PAGE_SIZE, offset });
      if (error) return Response.json({ error: "Catalogue artifact storage could not be listed" }, { status: 500 });
      objectPaths.push(...(data ?? []).filter((entry) => entry.id).map((entry) => `${archive.id}/${entry.name}`));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
    for (const paths of chunk(objectPaths, REMOVE_BATCH_SIZE)) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) return Response.json({ error: "Catalogue artifact storage could not be expired" }, { status: 500 });
      objectsRemoved += paths.length;
    }
    if (archive.status === "failed") {
      const reviewDelete = await supabase.from("vault_supplier_catalogue_review_items").delete().eq("archive_id", archive.id);
      const pageDelete = await supabase.from("vault_supplier_catalogue_pages").delete().eq("archive_id", archive.id);
      if (reviewDelete.error || pageDelete.error) return Response.json({ error: "Failed catalogue artifacts could not be expired" }, { status: 500 });
    } else {
      const { error } = await supabase.from("vault_supplier_catalogue_pages").update({ source_objects: [] }).eq("archive_id", archive.id);
      if (error) return Response.json({ error: "Completed catalogue references could not be cleared" }, { status: 500 });
    }
  }

  return Response.json({ success: true, archives_processed: archives.length, objects_removed: objectsRemoved });
});
