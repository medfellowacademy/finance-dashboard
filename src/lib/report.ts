import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReportFilters = { from: string; to: string; dept?: string };

export type LedgerRow = {
  id: string;
  kind: "in" | "out";
  txn_date: string;
  amount_paise: number;
  mode: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  parties: { name: string } | null;
  departments: { name: string } | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
};

/** Money actually received or paid in the period (what counts in the books). */
export async function getLedger({ from, to, dept }: ReportFilters): Promise<LedgerRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("transactions")
    .select(
      "id, kind, txn_date, amount_paise, mode, reference, notes, status, " +
        "parties(name), departments(name), categories(name), accounts(name)",
    )
    .in("status", ["received", "paid"])
    .gte("txn_date", from)
    .lte("txn_date", to)
    .order("txn_date")
    .order("created_at")
    .limit(20000);
  if (dept) q = q.eq("department_id", dept);
  const { data } = await q;
  return (data ?? []) as unknown as LedgerRow[];
}

export function groupSum(rows: LedgerRow[], key: (r: LedgerRow) => string) {
  const map = new Map<string, { in: number; out: number }>();
  for (const r of rows) {
    const k = key(r) || "—";
    const cur = map.get(k) ?? { in: 0, out: 0 };
    cur[r.kind] += Number(r.amount_paise);
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, net: v.in - v.out }))
    .sort((a, b) => b.in + b.out - (a.in + a.out));
}
