import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { monthLabel, monthStart, todayISO } from "@/lib/format";
import { Bar, ErrorBanner, Field, PageHeader } from "@/components/ui";
import { saveBudget } from "./actions";

export const metadata = { title: "Budgets – Medfellow Finance" };

function nextMonth(m: string) {
  const d = new Date(m + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const me = await getProfile();
  const sp = await searchParams;
  const month = monthStart(sp.month || todayISO());
  const staff = isStaff(me);
  const supabase = await createClient();
  const { departments } = await getLookups();

  const [{ data: budgets }, { data: spend }] = await Promise.all([
    supabase.from("budgets").select("department_id, amount_paise").eq("month", month),
    supabase
      .from("transactions")
      .select("department_id, amount_paise, status")
      .eq("kind", "out")
      .in("status", ["requested", "approved", "paid"])
      .gte("txn_date", month)
      .lt("txn_date", nextMonth(month))
      .limit(20000),
  ]);

  const visible = staff || me.role === "viewer" ? departments : departments.filter((d) => d.id === me.department_id);

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Budgets" subtitle={`Planned vs actual spend – ${monthLabel(month)}`} />
      <ErrorBanner message={sp.error} />

      <form className="card flex items-end gap-3">
        <Field label="Month"><input type="month" name="month" defaultValue={month.slice(0, 7)} className="input" /></Field>
        <button className="btn-ghost">Show</button>
      </form>

      <div className="space-y-3">
        {visible.map((d) => {
          const budget = Number(budgets?.find((b) => b.department_id === d.id)?.amount_paise ?? 0);
          const rows = spend?.filter((s) => s.department_id === d.id) ?? [];
          const paid = rows.filter((r) => r.status === "paid").reduce((a, r) => a + Number(r.amount_paise), 0);
          const committed = rows.filter((r) => r.status !== "paid").reduce((a, r) => a + Number(r.amount_paise), 0);
          const used = paid + committed;
          const over = budget > 0 && used > budget;
          return (
            <section key={d.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{d.name}</h2>
                {staff ? (
                  <form action={saveBudget} className="flex items-center gap-2">
                    <input type="hidden" name="department_id" value={d.id} />
                    <input type="hidden" name="month" value={month} />
                    <input name="amount" type="number" step="0.01" min="0" defaultValue={budget ? budget / 100 : ""} placeholder="Budget ₹" className="input w-36" />
                    <button className="btn-ghost">Save</button>
                  </form>
                ) : (
                  <p className="text-sm">Budget {budget ? formatINR(budget) : "not set"}</p>
                )}
              </div>
              <Bar value={used} max={Math.max(budget, used)} tone={over ? "rose" : "teal"} />
              <p className="text-xs text-zinc-600">
                Paid {formatINR(paid)} · Pending/approved {formatINR(committed)}
                {budget > 0 && <> · {over ? <b className="text-red-600">Over by {formatINR(used - budget)}</b> : <>Remaining {formatINR(budget - used)}</>}</>}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
