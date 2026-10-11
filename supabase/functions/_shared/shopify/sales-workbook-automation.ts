const MAX_AFFECTED_ORDERS = 25;

export async function triggerSalesWorkbookOrderReady(orderNumbers: Iterable<string | number>) {
  const values = [...new Set([...orderNumbers].map(value => String(value).trim()).filter(Boolean))];
  if (!values.length || values.length > MAX_AFFECTED_ORDERS) throw new Error("Invalid affected Sales workbook order scope");
  const baseUrl = Deno.env.get("VAULT_WEB_APP_URL");
  const secret = Deno.env.get("SALES_WORKBOOK_AUTOMATION_SECRET");
  if (!baseUrl || !secret) throw new Error("Sales workbook automation configuration unavailable");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/sales-workbook/order-ready`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vault-sales-workbook-automation-secret": secret },
    body: JSON.stringify({ orderNumbers: values }),
  });
  if (!response.ok) throw new Error("Sales workbook order-ready worker rejected the event");
}
