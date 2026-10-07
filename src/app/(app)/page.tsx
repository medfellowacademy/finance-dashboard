import Link from "next/link";
import { getProfile, isStaff, canSeeAll, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { monthLabel, monthStart, todayISO } from "@/lib/format";
import { allocate } from "@/lib/schedule";
import { Bar } from "@/components/ui";
import { signOut } from "@/app/login/actions";

export const metadata = { title: "Dashboard – Medfellow Finance" };

function addMonths(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const me = await getProfile();

  if (!me.is_active) {
    return (
      <div className="card max-w-lg">
        <h1 className="text-lg font-semibold">Waiting for approval</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Your account ({me.email}) is created but not active yet. Ask the Owner to activate it and
          assign your department and role.
        </p>
        <form action={signOut} className="mt-3"><button className="btn-ghost">Sign out</button></form>
      </div>
    );
  }

  const supabase = await createClient();
  const today = todayISO();
  const thisMonth = monthStart(today);
  const sixAgo = addMonths(thisMonth, -5);
  const wide = canSeeAll(me);
  const showFees = isStaff(me) || me.role === "viewer" || me.department_name === "Sales";
  const { departments, accounts } = await getLookups();

  const [totals, deptSpend, balances, pending, unassigned, paid, installments] = await Promise.all([
    supabase.rpc("monthly_totals", { p_from: sixAgo }),
    supabase.rpc("department_spend", { p_from: thisMonth, p_to: today }),
    isStaff(me) ? supabase.rpc("account_balances") : Promise.resolve({ data: [] as { account_id: string; balance_paise: number }[] }),
    supabase.from("transactions").select("amount_paise, status").eq("kind", "out").in("status", ["requested", "approved"]).limit(5000),
    isStaff(me)
      ? supabase.from("transactions").select("id", { count: "exact", head: true }).eq("kind", "in").is("account_id", null)
      : Promise.resolve({ count: 0 }),
    showFees ? supabase.from("transactions").select("fee_plan_id, amount_paise").eq("kind", "in").not("fee_plan_id", "is", null).limit(30000) : Promise.resolve({ data: [] }),
    showFees ? supabase.from("installments").select("id, fee_plan_id, seq, due_date, amount_paise").lt("due_date", today).limit(30000) : Promise.resolve({ data: [] }),
  ]);

  // Month by month in/out
  const months = Array.from({ length: 6 }, (_, i) => addMonths(sixAgo, i));
  const series = months.map((m) => {
    const get = (k: string) => Number((totals.data ?? []).find((t: { month: string; kind: string; total_paise: number }) => t.month === m && t.kind === k)?.total_paise ?? 0);
    return { month: m, in: get("in"), out: get("out") };
  });
  const maxBar = Math.max(1, ...series.flatMap((s) => [s.in, s.out]));
  const cur = series[series.length - 1];

  // Overdue fees (installments due before today not covered by payments)
  const paidBy = new Map<string, number>();
  (paid.data ?? []).forEach((t: { fee_plan_id: string; amount_paise: number }) => paidBy.set(t.fee_plan_id, (paidBy.get(t.fee_plan_id) ?? 0) + Number(t.amount_paise)));
  const instBy = new Map<string, { id: string; fee_plan_id: string; seq: number; due_date: string; amount_paise: number }[]>();
  (installments.data ?? []).forEach((i: { id: string; fee_plan_id: string; seq: number; due_date: string; amount_paise: number }) => instBy.set(i.fee_plan_id, [...(instBy.get(i.fee_plan_id) ?? []), i]));
  let overdueCount = 0, overdueAmount = 0;
  instBy.forEach((list, planId) => {
    // Allocation must start from installment #1, so only plans with a past-due installment are inspected.
    const od = allocate(list, paidBy.get(planId) ?? 0, today).filter((s) => s.status === "overdue");
    overdueCount += od.length ? 1 : 0;
    overdueAmount += od.reduce((a, s) => a + (Number(s.amount_paise) - s.covered), 0);
  });

  const waiting = (pending.data ?? []).filter((p) => p.status === "requested");
  const toPay = (pending.data ?? []).filter((p) => p.status === "approved");
  const sumP = (l: { amount_paise: number }[]) => l.reduce((a, r) => a + Number(r.amount_paise), 0);

  const spend = departments
    .map((d) => ({
      name: d.name,
      out: Number((deptSpend.data ?? []).find((s: { department_id: string; kind: string }) => s.department_id === d.id && s.kind === "out")?.total_paise ?? 0),
      in: Number((deptSpend.data ?? []).find((s: { department_id: string; kind: string }) => s.department_id === d.id && s.kind === "in")?.total_paise ?? 0),
    }))
    .filter((d) => d.out > 0 || d.in > 0)
    .sort((a, b) => b.out - a.out);
  const maxSpend = Math.max(1, ...spend.map((s) => Math.max(s.in, s.out)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {me.full_name || me.email}</h1>
        <p className="text-sm text-zinc-500">
          {ROLE_LABEL[me.role]}{me.department_name ? ` · ${me.department_name}` : ""} · {monthLabel(thisMonth)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card"><p className="text-xs uppercase text-zinc-500">Received this month</p><p className="text-2xl font-semibold text-emerald-700">{formatINR(cur.in)}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Paid this month</p><p className="text-2xl font-semibold text-rose-700">{formatINR(cur.out)}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Net this month</p><p className="text-2xl font-semibold">{formatINR(cur.in - cur.out)}</p></div>
        {showFees && (
          <Link href="/students?filter=overdue" className="card block hover:border-teal-600">
            <p className="text-xs uppercase text-zinc-500">Overdue fees</p>
            <p className="text-2xl font-semibold text-red-600">{formatINR(overdueAmount)}</p>
            <p className="text-xs text-zinc-500">{overdueCount} student plan(s)</p>
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/money-out?status=requested" className="card block hover:border-teal-600">
          <p className="text-xs uppercase text-zinc-500">Awaiting Owner approval</p>
          <p className="text-xl font-semibold text-amber-600">{waiting.length} · {formatINR(sumP(waiting))}</p>
        </Link>
        <Link href="/money-out?status=approved" className="card block hover:border-teal-600">
          <p className="text-xs uppercase text-zinc-500">Approved, waiting to be paid</p>
          <p className="text-xl font-semibold text-sky-700">{toPay.length} · {formatINR(sumP(toPay))}</p>
        </Link>
        {isStaff(me) && (
          <Link href="/money-in" className="card block hover:border-teal-600">
            <p className="text-xs uppercase text-zinc-500">Receipts without an account</p>
            <p className="text-xl font-semibold">{unassigned.count ?? 0}</p>
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">Last 6 months</h2>
          {series.map((s) => (
            <div key={s.month} className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-600"><span>{monthLabel(s.month)}</span><span>{formatINR(s.in)} in · {formatINR(s.out)} out</span></div>
              <Bar value={s.in} max={maxBar} />
              <Bar value={s.out} max={maxBar} tone="rose" />
            </div>
          ))}
          <p className="text-xs text-zinc-500"><span className="text-teal-700">■</span> money in <span className="ml-3 text-rose-500">■</span> money out</p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">{wide ? "By department" : "My department"} – this month</h2>
          {spend.map((s) => (
            <div key={s.name} className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-600"><span>{s.name}</span><span>{formatINR(s.in)} in · {formatINR(s.out)} out</span></div>
              {s.in > 0 && <Bar value={s.in} max={maxSpend} />}
              {s.out > 0 && <Bar value={s.out} max={maxSpend} tone="rose" />}
            </div>
          ))}
          {spend.length === 0 && <p className="text-sm text-zinc-500">No activity yet this month.</p>}
        </section>
      </div>

      {isStaff(me) && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold">Account balances</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {accounts.map((a) => {
              const b = (balances.data ?? []).find((x: { account_id: string; balance_paise: number }) => x.account_id === a.id);
              return (
                <div key={a.id} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">{a.name}</p>
                  <p className="text-lg font-semibold">{formatINR(Number(b?.balance_paise ?? 0))}</p>
                </div>
              );
            })}
            {accounts.length === 0 && <p className="text-sm text-zinc-500">Add accounts under Settings → Accounts.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
