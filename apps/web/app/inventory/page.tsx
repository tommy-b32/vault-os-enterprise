import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const { data, error } = await supabase
    .from("vault_inventory_intelligence")
    .select(
      `
        product_id,
        product_name,
        stock_on_hand,
        committed_stock,
        incoming_stock,
        last_inventory_sync
      `,
    )
    .order("stock_on_hand", {
      ascending: true,
    })
    .limit(10);

  if (error) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "40px",
          background: "#070807",
          color: "#ef654f",
        }}
      >
        <h1>Inventory connection failed</h1>
        <pre>{error.message}</pre>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        background: "#070807",
        color: "#f4f1e9",
      }}
    >
      <h1>Live Inventory Test</h1>

      <p>
        Vault OS successfully received{" "}
        <strong>{data?.length ?? 0}</strong>{" "}
        inventory records.
      </p>

      <pre
        style={{
          marginTop: "24px",
          padding: "20px",
          overflow: "auto",
          background: "#101211",
          border: "1px solid #292b27",
          borderRadius: "12px",
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}