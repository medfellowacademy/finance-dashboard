import Link from "next/link";
import { getProfile, canWrite, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { fmtDate, MODE_LABEL, monthStart, todayISO } from "@/lib/format";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { assignAccount, deleteTransaction } from "./actions";
import { createInvoice } from "../invoices/actions";

export const metadata = { title: "Money In – Medfellow Finance" };

type Search = { error?: string; from?: string; to?: string; dept?: string; mode?: string; q?: string };

export default async function MoneyInPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await getProfile();
  const sp = await searchParams;
  const from = sp.from || monthStart(todayISO());
  const to = sp.to || todayISO();
  const staff = isStaff(me);

  const supabase = await createClient();
  const { departments, accounts } = await getLookups();

  let query = supabase
    .from("transactions")
    .select(
      "id, txn_date, amount_paise, mode, reference, account_id, notes, reconciled, " +
        "parties(name), departments(name), categories(name), accounts(name), attachments(id, file_name), invoices(id, invoice_no)",
    )
    .eq("kind", "in")
    .gte("txn_date", from)
    .lte("txn_date", to)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.dept) query = query.eq("department_id", sp.dept);
  if (sp.mode) query = query.eq("mode", sp.mode);
  const { data } = await query;
  type Row = {
    id: string; txn_date: string; amount_paise: number; mode: string | null; reference: string | null;
    account_id: string | null; notes: string | null; reconciled: boolean;
    parties: { name: string } | null; departments: { name: string } | null;
    categories: { name: string } | null; accounts: { name: string } | null;
    attachments: { id: string; file_name: string }[]; invoices: { id: string; invoice_no: string } | { id: string; invoice_no: string }[] | null;
  };
  let rows = (data ?? []) as unknown as Row[];
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) => `${r.parties?.name ?? ""} ${r.reference ?? ""} ${r.notes ?? ""}`.toLowerCase().includes(q));
  }
  const total = rows.reduce((a, r) => a + Number(r.amount_paise), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Money In" subtitle="All payments received by the academy">
        {canWrite(me) && me.is_active && (staff || me.department_name === "Sales") && (
          <Link href="/money-in/new" className="btn-primary">+ Record receipt</Link>
        )}
      </PageHeader>
      <ErrorBanner message={sp.error} />

      <form className="card flex flex-wrap items-end gap-3">
        <Field label="From"><input type="date" name="from" defaultValue={from} className="input" /></Field>
        <Field label="To"><input type="date" name="to" defaultValue={to} className="input" /></Field>
        {(staff || me.role === "viewer") && (
          <Field label="Department">
            <select name="dept" defaultValue={sp.dept ?? ""} className="input">
              <option value="">All</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Mode">
          <select name="mode" defaultValue={sp.mode ?? ""} className="input">
            <option value="">All</option>
            {Object.entries(MODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Search"><input name="q" defaultValue={sp.q ?? ""} placeholder="Name / reference" className="input" /></Field>
        <button className="btn-primary">Filter</button>
      </form>

      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <p className="text-sm text-zinc-500">{rows.length} receipts</p>
          <p className="text-lg font-semibold text-emerald-700">{formatINR(total)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-zinc-200">
              <tr>
                <th className="th">Date</th><th className="th">From</th><th className="th">Category</th>
                <th className="th">Dept</th><th className="th">Mode</th><th className="th">Account</th>
                <th className="th text-right">Amount</th><th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => {
                const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
                return (
                  <tr key={r.id}>
                    <td className="td whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                    <td className="td">
                      <p className="font-medium">{r.parties?.name ?? "—"}</p>
                      {(r.reference || r.notes) && (
                        <p className="text-xs text-zinc-500">{[r.reference, r.notes].filter(Boolean).join(" · ")}</p>
                      )}
                    </td>
                    <td className="td">{r.categories?.name ?? "—"}</td>
                    <td className="td">{r.departments?.name}</td>
                    <td className="td">{r.mode ? MODE_LABEL[r.mode] : "—"}</td>
                    <td className="td">
                      {r.accounts?.name ??
                        (staff ? (
                          <form action={assignAccount} className="flex gap-1">
                            <input type="hidden" name="id" value={r.id} />
                            <select name="account_id" required className="input w-36 py-1">
                              <option value="">Assign…</option>
                              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <button className="btn-ghost">Set</button>
                          </form>
                        ) : (
                          <span className="text-amber-600">Pending</span>
                        ))}
                    </td>
                    <td className="td text-right font-medium">{formatINR(r.amount_paise)}</td>
                    <td className="td whitespace-nowrap text-xs">
                      {r.attachments?.map((a) => (
                        <a key={a.id} href={`/attachments/${a.id}`} target="_blank" className="mr-2 underline" title={a.file_name}>File</a>
                      ))}
                      {inv ? (
                        <Link href={`/invoices/${inv.id}`} className="mr-2 underline">{inv.invoice_no}</Link>
                      ) : (
                        canWrite(me) && (
                          <form action={createInvoice} className="mr-2 inline">
                            <input type="hidden" name="transaction_id" value={r.id} />
                            <button className="underline">Invoice</button>
                          </form>
                        )
                      )}
                      {staff && (
                        <form action={deleteTransaction} className="inline">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="return_to" value="/money-in" />
                          <button className="text-red-600 underline">Delete</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="td py-8 text-center text-zinc-500">No receipts in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
