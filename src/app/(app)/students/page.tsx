import Link from "next/link";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { fmtDate, todayISO } from "@/lib/format";
import { allocate } from "@/lib/schedule";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Students & fees – Medfellow Finance" };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const me = await getProfile();
  const { q, filter } = await searchParams;
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: plans }, { data: paid }, { data: installments }] = await Promise.all([
    supabase
      .from("fee_plans")
      .select("id, student_id, total_paise, discount_paise, status, parties(name, phone), courses(name)")
      .neq("status", "cancelled")
      .limit(3000),
    supabase.from("transactions").select("fee_plan_id, amount_paise").eq("kind", "in").not("fee_plan_id", "is", null).limit(20000),
    supabase.from("installments").select("id, fee_plan_id, seq, due_date, amount_paise").limit(40000),
  ]);

  const paidBy = new Map<string, number>();
  paid?.forEach((t) => paidBy.set(t.fee_plan_id, (paidBy.get(t.fee_plan_id) ?? 0) + Number(t.amount_paise)));
  const instBy = new Map<string, NonNullable<typeof installments>>();
  installments?.forEach((i) => instBy.set(i.fee_plan_id, [...(instBy.get(i.fee_plan_id) ?? []), i]));

  type Plan = {
    id: string; student_id: string; total_paise: number; discount_paise: number; status: string;
    parties: { name: string; phone: string | null } | null; courses: { name: string } | null;
  };
  let rows = ((plans ?? []) as unknown as Plan[]).map((p) => {
    const payable = p.total_paise - p.discount_paise;
    const got = paidBy.get(p.id) ?? 0;
    const sched = allocate(instBy.get(p.id) ?? [], got, today);
    const overdue = sched.filter((s) => s.status === "overdue");
    const next = sched.find((s) => s.status !== "paid");
    return {
      ...p, payable, got, balance: Math.max(0, payable - got),
      overdueAmt: overdue.reduce((a, s) => a + (Number(s.amount_paise) - s.covered), 0),
      nextDue: next?.due_date ?? null,
    };
  });

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => `${r.parties?.name} ${r.parties?.phone ?? ""} ${r.courses?.name ?? ""}`.toLowerCase().includes(needle));
  }
  if (filter === "overdue") rows = rows.filter((r) => r.overdueAmt > 0);
  if (filter === "pending") rows = rows.filter((r) => r.balance > 0);
  rows.sort((a, b) => b.overdueAmt - a.overdueAmt || b.balance - a.balance);

  const totals = rows.reduce(
    (a, r) => ({ payable: a.payable + r.payable, got: a.got + r.got, overdue: a.overdue + r.overdueAmt }),
    { payable: 0, got: 0, overdue: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Students & fees" subtitle="Negotiated fee plans, installments and pending balances">
        {me.is_active && (isStaff(me) || me.department_name === "Sales") && (
          <Link href="/students/new" className="btn-primary">+ New student & plan</Link>
        )}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-xs uppercase text-zinc-500">Total payable</p><p className="text-xl font-semibold">{formatINR(totals.payable)}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Collected</p><p className="text-xl font-semibold text-emerald-700">{formatINR(totals.got)}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Overdue</p><p className="text-xl font-semibold text-red-600">{formatINR(totals.overdue)}</p></div>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <input name="q" defaultValue={q ?? ""} placeholder="Search name / phone / course" className="input max-w-xs" />
        <select name="filter" defaultValue={filter ?? ""} className="input w-44">
          <option value="">All plans</option>
          <option value="pending">With balance due</option>
          <option value="overdue">Overdue only</option>
        </select>
        <button className="btn-primary">Filter</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Student</th><th className="th">Course</th>
              <th className="th text-right">Payable</th><th className="th text-right">Paid</th>
              <th className="th text-right">Balance</th><th className="th">Next due</th><th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <Link href={`/students/${r.student_id}`} className="font-medium underline">{r.parties?.name}</Link>
                  <p className="text-xs text-zinc-500">{r.parties?.phone}</p>
                </td>
                <td className="td">{r.courses?.name ?? "—"}</td>
                <td className="td text-right">{formatINR(r.payable)}</td>
                <td className="td text-right">{formatINR(r.got)}</td>
                <td className="td text-right font-medium">{formatINR(r.balance)}</td>
                <td className="td">{r.balance > 0 ? fmtDate(r.nextDue) : "—"}</td>
                <td className="td">
                  {r.overdueAmt > 0 ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Overdue {formatINR(r.overdueAmt)}</span>
                  ) : r.balance === 0 ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Fully paid</span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">On track</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="td py-8 text-center text-zinc-500">No fee plans found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
