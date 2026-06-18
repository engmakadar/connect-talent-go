// Generates a printable receipt in a new window for any payment transaction.
export type ReceiptInput = {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string | null;
  status: string;
  plan_name?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  company_name?: string | null;
  notes?: string | null;
};

function methodLabel(m: string) {
  const map: Record<string, string> = {
    free_trial: "Free trial",
    visa: "Visa card",
    mastercard: "Mastercard",
    paypal: "PayPal",
    evc: "EVC Plus",
    zaad: "Zaad",
    sahal: "Sahal",
    mpesa: "M-Pesa",
  };
  return map[m] ?? m;
}

export function downloadReceipt(r: ReceiptInput) {
  const date = new Date(r.created_at).toLocaleString();
  const amount = r.method === "free_trial" ? "Free" : `${r.currency} ${Number(r.amount).toFixed(2)}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${r.id.slice(0, 8)}</title>
<style>
  *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a}
  body{margin:0;padding:48px;background:#f8fafc}
  .card{max-width:680px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.06);padding:40px}
  h1{font-size:24px;margin:0 0 4px}
  .muted{color:#64748b;font-size:13px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px}
  .row:last-child{border-bottom:0}
  .label{color:#64748b}
  .total{margin-top:24px;padding:18px;background:#f8fafc;border-radius:12px;display:flex;justify-content:space-between;align-items:center}
  .total b{font-size:22px}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;text-transform:capitalize}
  .actions{margin:20px auto 0;max-width:680px;text-align:right}
  button{background:#0f172a;color:#fff;border:0;padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:600}
  @media print{.actions{display:none}body{padding:0;background:#fff}.card{box-shadow:none}}
</style></head><body>
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:24px">
    <div><h1>SahanJobs</h1><p class="muted">Payment receipt</p></div>
    <div style="text-align:right"><p class="muted">Receipt #</p><p style="font-family:ui-monospace,monospace;font-size:13px;margin:2px 0">${r.id}</p></div>
  </div>
  <div class="row"><span class="label">Date</span><span>${date}</span></div>
  <div class="row"><span class="label">Status</span><span class="badge">${r.status}</span></div>
  ${r.plan_name ? `<div class="row"><span class="label">Plan</span><span>${r.plan_name}</span></div>` : ""}
  ${r.company_name ? `<div class="row"><span class="label">Company</span><span>${r.company_name}</span></div>` : ""}
  ${r.payer_name ? `<div class="row"><span class="label">Billed to</span><span>${r.payer_name}${r.payer_email ? ` (${r.payer_email})` : ""}</span></div>` : ""}
  <div class="row"><span class="label">Payment method</span><span>${methodLabel(r.method)}</span></div>
  ${r.reference ? `<div class="row"><span class="label">Reference</span><span style="font-family:ui-monospace,monospace">${r.reference}</span></div>` : ""}
  ${r.notes ? `<div class="row"><span class="label">Notes</span><span>${r.notes}</span></div>` : ""}
  <div class="total"><span>Total</span><b>${amount}</b></div>
  <p class="muted" style="margin-top:24px;text-align:center">Thank you for your business.</p>
</div>
<div class="actions"><button onclick="window.print()">Download / Print</button></div>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
