import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { reconcile } from "./actions";

export const metadata = { title: "Reconcile – Medfellow Finance" };

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; statement?: string; error?: string }>;
}) {
  await requireRole("owner", "finance");
  const sp = await searchParams;
  const supabase = await createClient();
  const { accounts } = await getLookups();
  const account = accounts.find((a) => a.id === sp.account);

  let body = null;
  if (account) {
    const [{ data: acc }, { data: txns }] = await Promise.all([
      supabase.from("accounts").select("opening_balance_paise").eq("id", account.id).single(),
      supabase
        .from("transactions")
        .select("id, kind, txn_date, amount_paise, reconciled, reference, parties(name), categories(name)")
        .eq("account_id", account.id)
        .in("status", ["received", "paid"])
        .order("txn_date")
        .limit(5000),
    ]);
    const rows = (txns ?? []) as unknown as {
      id: string; kind: "in" | "out"; txn_date: string; amount_paise: number; reconciled: boolean;
      reference: string | null; parties: { name: string } | null; categories: { name: string } | null;
    }[];
    const signed = (r: { kind: string; amount_paise: number }) => (r.kind === "in" ? 1 : -1) * Number(r.amount_paise);
    const opening = Number(acc?.opening_balance_paise ?? 0);
    const book = opening + rows.reduce((a, r) => a + signed(r), 0);
    const reconciledBal = opening + rows.filter((r) => r.reconciled).reduce((a, r) => a + signed(r), 0);
    const statement = sp.statement ? Math.round(Number(sp.statement) * 100) : null;
    const open = rows.filter((r) => !r.reconciled);

    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card"><p className="text-xs uppercase text-zinc-500">Book balance</p><p className="text-xl font-semibold">{formatINR(book)}</p></div>
          <div className="card"><p className="text-xs uppercase text-zinc-500">Reconciled balance</p><p className="text-xl font-semibold">{formatINR(reconciledBal)}</p></div>
          <div className="card">
            <p className="text-xs uppercase text-zinc-500">Difference vs bank statement</p>
            <p className={`text-xl font-semibold ${statement != null && statement !== reconciledBal ? "text-red-600" : ""}`}>
              {statement != null ? formatINR(statement - reconciledBal) : "Enter statement balance"}
            </p>
          </div>
        </div>

        <form action={reconcile} className="card p-0">
          <input type="hidden" name="account" value={account.id} />
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium">{open.length} entries not yet matched with the bank statement</p>
            <button className="btn-primary">Mark selected as reconciled</button>
          </div>
          <table className="w-full">
            <thead><tr><th className="th w-10" /><th className="th">Date</th><th className="th">Party</th><th className="th">Category</th><th className="th">Ref</th><th className="th text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {open.map((r) => (
                <tr key={r.id}>
                  <td className="td"><input type="checkbox" name="ids" value={r.id} /></td>
                  <td className="td whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                  <td className="td">{r.parties?.name ?? "—"}</td>
                  <td className="td">{r.categories?.name ?? "—"}</td>
                  <td className="td">{r.reference ?? "—"}</td>
                  <td className={`td text-right font-medium ${r.kind === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                    {r.kind === "in" ? "+" : "−"}{formatINR(r.amount_paise)}
                  </td>
                </tr>
              ))}
              {open.length === 0 && <tr><td colSpan={6} className="td py-6 text-center text-zinc-500">Everything is reconciled.</td></tr>}
            </tbody>
          </table>
        </form>
      </>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Bank reconciliation" subtitle="Tick entries that appear on the bank statement, then compare balances" />
      <ErrorBanner message={sp.error} />
      <form className="card flex flex-wrap items-end gap-3">
        <Field label="Account">
          <select name="account" defaultValue={sp.account ?? ""} required className="input">
            <option value="">— choose —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Closing balance on statement (₹)">
          <input name="statement" type="number" step="0.01" defaultValue={sp.statement} className="input" />
        </Field>
        <button className="btn-primary">Show</button>
      </form>
      {body}
    </div>
  );
}
