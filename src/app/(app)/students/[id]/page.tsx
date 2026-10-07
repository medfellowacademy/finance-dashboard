import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile, isStaff, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { fmtDate, MODE_LABEL, todayISO } from "@/lib/format";
import { allocate } from "@/lib/schedule";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { updatePlan } from "../actions";

export const metadata = { title: "Student – Medfellow Finance" };

const TONE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-red-50 text-red-700",
  partial: "bg-amber-50 text-amber-700",
  pending: "bg-zinc-100 text-zinc-600",
};

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const me = await getProfile();
  const supabase = await createClient();
  const today = todayISO();

  const { data: student } = await supabase.from("parties").select("*").eq("id", id).eq("kind", "student").single();
  if (!student) notFound();

  const { data: plans } = await supabase
    .from("fee_plans")
    .select("id, total_paise, discount_paise, gst_rate, gst_inclusive, status, notes, courses(name), installments(id, seq, due_date, amount_paise)")
    .eq("student_id", id)
    .order("created_at");

  const { data: receipts } = await supabase
    .from("transactions")
    .select("id, fee_plan_id, txn_date, amount_paise, mode, reference, invoices(id, invoice_no)")
    .eq("party_id", id)
    .eq("kind", "in")
    .order("txn_date", { ascending: false });

  type Inst = { id: string; seq: number; due_date: string; amount_paise: number };

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title={student.name} subtitle={[student.phone, student.email, student.state].filter(Boolean).join(" · ")}>
        {me.is_active && (isStaff(me) || me.department_name === "Sales") && (
          <Link href={`/students/new?student=${id}`} className="btn-ghost">+ Another plan</Link>
        )}
        {me.is_active && canWrite(me) && (
          <Link href={`/money-in/new?student=${id}&return_to=/students/${id}`} className="btn-primary">Record payment</Link>
        )}
      </PageHeader>
      <ErrorBanner message={error} />

      {plans?.map((p) => {
        const planReceipts = receipts?.filter((r) => r.fee_plan_id === p.id) ?? [];
        const paid = planReceipts.reduce((a, r) => a + Number(r.amount_paise), 0);
        const payable = p.total_paise - p.discount_paise;
        const sched = allocate((p.installments ?? []) as Inst[], paid, today);
        const course = (p.courses as unknown as { name: string } | null)?.name ?? "Fee plan";
        return (
          <section key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{course} {p.status !== "active" && <span className="text-sm font-normal text-zinc-500">({p.status})</span>}</h2>
              <p className="text-sm text-zinc-600">
                Fee {formatINR(p.total_paise)} − discount {formatINR(p.discount_paise)} = <b>{formatINR(payable)}</b>
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <p>Paid <b className="text-emerald-700">{formatINR(paid)}</b></p>
              <p>Balance <b>{formatINR(Math.max(0, payable - paid))}</b></p>
              {paid > payable && <p className="text-amber-600">Overpaid by {formatINR(paid - payable)}</p>}
            </div>

            <table className="w-full">
              <thead className="border-b border-zinc-200"><tr>
                <th className="th">#</th><th className="th">Due</th><th className="th text-right">Amount</th>
                <th className="th text-right">Covered</th><th className="th">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {sched.map((s) => (
                  <tr key={s.id}>
                    <td className="td">{s.seq}</td><td className="td">{fmtDate(s.due_date)}</td>
                    <td className="td text-right">{formatINR(s.amount_paise)}</td>
                    <td className="td text-right">{formatINR(s.covered)}</td>
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[s.status]}`}>{s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {planReceipts.length > 0 && (
              <div>
                <p className="mb-1 text-xs uppercase text-zinc-500">Payments received</p>
                <ul className="divide-y divide-zinc-100 text-sm">
                  {planReceipts.map((r) => {
                    const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
                    return (
                      <li key={r.id} className="flex justify-between py-1.5">
                        <span>{fmtDate(r.txn_date)} · {r.mode ? MODE_LABEL[r.mode] : ""}{r.reference ? ` · ${r.reference}` : ""}</span>
                        <span>
                          {inv && <Link className="mr-3 text-xs underline" href={`/invoices/${inv.id}`}>{inv.invoice_no}</Link>}
                          <b>{formatINR(r.amount_paise)}</b>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {isStaff(me) && (
              <details className="rounded-md border border-zinc-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">Edit fee, discount & schedule</summary>
                <form action={updatePlan} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="plan_id" value={p.id} />
                  <input type="hidden" name="student_id" value={id} />
                  <label className="text-xs text-zinc-500">Fee (₹)<input name="total" type="number" step="0.01" defaultValue={p.total_paise / 100} className="input mt-1" /></label>
                  <label className="text-xs text-zinc-500">Discount (₹)<input name="discount" type="number" step="0.01" defaultValue={p.discount_paise / 100} className="input mt-1" /></label>
                  <label className="text-xs text-zinc-500">GST %<input name="gst_rate" type="number" step="0.01" defaultValue={p.gst_rate} className="input mt-1" /></label>
                  <label className="text-xs text-zinc-500">Status
                    <select name="status" defaultValue={p.status} className="input mt-1">
                      <option value="active">Active</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="gst_inclusive" defaultChecked={p.gst_inclusive} /> Fee includes GST</label>
                  <label className="text-xs text-zinc-500 sm:col-span-3">Schedule (YYYY-MM-DD, amount per line – must add up to fee − discount)
                    <textarea name="custom" rows={4} defaultValue={[...(p.installments ?? [])].sort((a, b) => a.seq - b.seq).map((i) => `${i.due_date}, ${i.amount_paise / 100}`).join("\n")} className="input mt-1 font-mono" />
                  </label>
                  <label className="text-xs text-zinc-500 sm:col-span-3">Notes<input name="notes" defaultValue={p.notes ?? ""} className="input mt-1" /></label>
                  <button className="btn-primary sm:col-span-3">Save changes</button>
                </form>
              </details>
            )}
          </section>
        );
      })}
      {plans?.length === 0 && <p className="text-sm text-zinc-500">No fee plan yet for this student.</p>}
    </div>
  );
}
