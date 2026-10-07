import Link from "next/link";
import { getProfile, canWrite, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { fmtDate, MODE_LABEL, STATUS_LABEL, todayISO } from "@/lib/format";
import { ErrorBanner, Field, PageHeader, StatusBadge } from "@/components/ui";
import { cancelPayment, decidePayment, markPaid } from "./actions";
import { deleteTransaction } from "../money-in/actions";

export const metadata = { title: "Money Out – Medfellow Finance" };

type Search = { error?: string; status?: string; dept?: string; from?: string; to?: string };

export default async function MoneyOutPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await getProfile();
  const sp = await searchParams;
  const staff = isStaff(me);
  const supabase = await createClient();
  const { departments, accounts } = await getLookups();

  let query = supabase
    .from("transactions")
    .select(
      "id, txn_date, amount_paise, status, mode, reference, notes, created_by, " +
        "parties(name), departments(name), categories(name), accounts(name), attachments(id, file_name)",
    )
    .eq("kind", "out")
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.dept) query = query.eq("department_id", sp.dept);
  if (sp.from) query = query.gte("txn_date", sp.from);
  if (sp.to) query = query.lte("txn_date", sp.to);
  const { data } = await query;
  type Row = {
    id: string; txn_date: string; amount_paise: number; status: string; mode: string | null;
    reference: string | null; notes: string | null; created_by: string;
    parties: { name: string } | null; departments: { name: string } | null; categories: { name: string } | null;
    accounts: { name: string } | null; attachments: { id: string; file_name: string }[];
  };
  const rows = (data ?? []) as unknown as Row[];

  const waiting = rows.filter((r) => r.status === "requested");
  const toPay = rows.filter((r) => r.status === "approved");
  const sumOf = (list: Row[]) => list.reduce((a, r) => a + Number(r.amount_paise), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Money Out" subtitle="Payments requested, approved and paid">
        {canWrite(me) && me.is_active && <Link href="/money-out/new" className="btn-primary">+ New payment</Link>}
      </PageHeader>
      <ErrorBanner message={sp.error} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-xs uppercase text-zinc-500">Awaiting Owner approval</p><p className="text-xl font-semibold text-amber-600">{waiting.length} · {formatINR(sumOf(waiting))}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Approved, to be paid</p><p className="text-xl font-semibold text-sky-700">{toPay.length} · {formatINR(sumOf(toPay))}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Paid (this list)</p><p className="text-xl font-semibold">{formatINR(sumOf(rows.filter((r) => r.status === "paid")))}</p></div>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <Field label="Status">
          <select name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">All</option>
            {["requested", "approved", "paid", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        {(staff || me.role === "viewer") && (
          <Field label="Department">
            <select name="dept" defaultValue={sp.dept ?? ""} className="input">
              <option value="">All</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="From"><input type="date" name="from" defaultValue={sp.from} className="input" /></Field>
        <Field label="To"><input type="date" name="to" defaultValue={sp.to} className="input" /></Field>
        <button className="btn-primary">Filter</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Date</th><th className="th">Payee</th><th className="th">Category</th>
              <th className="th">Dept</th><th className="th">Status</th><th className="th text-right">Amount</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="td whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                <td className="td">
                  <p className="font-medium">{r.parties?.name ?? "—"}</p>
                  {(r.reference || r.notes) && <p className="text-xs text-zinc-500">{[r.reference, r.notes].filter(Boolean).join(" · ")}</p>}
                  {r.attachments?.map((a) => (
                    <a key={a.id} href={`/attachments/${a.id}`} target="_blank" className="mr-2 text-xs underline">{a.file_name}</a>
                  ))}
                </td>
                <td className="td">{r.categories?.name ?? "—"}</td>
                <td className="td">{r.departments?.name}</td>
                <td className="td">
                  <StatusBadge status={r.status} />
                  {r.status === "paid" && <p className="mt-1 text-xs text-zinc-500">{r.accounts?.name} · {r.mode ? MODE_LABEL[r.mode] : ""}</p>}
                </td>
                <td className="td text-right font-medium">{formatINR(r.amount_paise)}</td>
                <td className="td space-y-2 text-xs">
                  {me.role === "owner" && r.status === "requested" && (
                    <form action={decidePayment} className="flex gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <button name="decision" value="approve" className="btn-primary px-2 py-1 text-xs">Approve</button>
                      <button name="decision" value="reject" className="btn-ghost text-red-600">Reject</button>
                    </form>
                  )}
                  {staff && r.status === "approved" && (
                    <form action={markPaid} className="flex flex-wrap gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="account_id" required className="input w-36 py-1">
                        <option value="">Pay from…</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <input type="date" name="paid_date" defaultValue={todayISO()} required className="input w-36 py-1" />
                      <input name="reference" placeholder="UTR / ref" className="input w-28 py-1" />
                      <button className="btn-primary px-2 py-1 text-xs">Mark paid</button>
                    </form>
                  )}
                  {(r.status === "requested" || r.status === "approved") && (staff || r.created_by === me.id) && (
                    <form action={cancelPayment}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-red-600 underline">Cancel</button>
                    </form>
                  )}
                  {staff && (
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="return_to" value="/money-out" />
                      <button className="text-zinc-400 underline">Delete</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="td py-8 text-center text-zinc-500">No payments found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
