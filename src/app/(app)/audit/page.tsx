import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log – Medfellow Finance" };

const FIELDS_TO_SKIP = new Set(["created_at", "created_by", "id"]);

function diff(oldD: Record<string, unknown> | null, newD: Record<string, unknown> | null) {
  if (!oldD && newD) return Object.entries(newD).filter(([k, v]) => !FIELDS_TO_SKIP.has(k) && v != null).slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`);
  if (oldD && !newD) return ["record removed"];
  return Object.keys(newD ?? {})
    .filter((k) => JSON.stringify(oldD?.[k]) !== JSON.stringify(newD?.[k]))
    .map((k) => `${k}: ${String(oldD?.[k] ?? "—")} → ${String(newD?.[k] ?? "—")}`);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requireRole("owner");
  const { table } = await searchParams;
  const supabase = await createClient();

  let q = supabase.from("audit_log").select("id, table_name, record_id, action, old_data, new_data, user_id, created_at")
    .order("id", { ascending: false }).limit(300);
  if (table) q = q.eq("table_name", table);
  const [{ data: logs }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, full_name, email")]);
  const who = new Map(people?.map((p) => [p.id, p.full_name || p.email]));

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader title="Audit log" subtitle="Every change to money, plans, invoices and settings – who and when" />
      <form className="card flex gap-3">
        <select name="table" defaultValue={table ?? ""} className="input w-52">
          <option value="">All records</option>
          {["transactions", "fee_plans", "installments", "invoices", "parties", "budgets", "departments", "categories", "accounts", "profiles", "company_settings"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className="btn-ghost">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">What</th><th className="th">Changes</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {logs?.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="td whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString("en-IN")}</td>
                <td className="td text-xs">{l.user_id ? who.get(l.user_id) ?? "—" : "system"}</td>
                <td className="td text-xs"><b>{l.action}</b> {l.table_name}</td>
                <td className="td text-xs text-zinc-600">{diff(l.old_data, l.new_data).join("; ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
