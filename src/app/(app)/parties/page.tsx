import { getProfile, canWrite, canSeeAll } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { INDIAN_STATES } from "@/lib/format";
import { addParty, setPartyActive } from "./actions";

export const metadata = { title: "Vendors & staff – Medfellow Finance" };

const KIND_LABEL: Record<string, string> = { vendor: "Vendor", employee: "Staff", other: "Other" };

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ error?: string; kind?: string }> }) {
  const me = await getProfile();
  const { error, kind } = await searchParams;
  const supabase = await createClient();

  let q = supabase.from("parties").select("id, name, kind, phone, email, gstin, is_active").neq("kind", "student").order("name").limit(2000);
  if (kind) q = q.eq("kind", kind);
  const [{ data: parties }, { data: paid }] = await Promise.all([
    q,
    supabase.from("transactions").select("party_id, amount_paise").eq("kind", "out").eq("status", "paid").not("party_id", "is", null).limit(20000),
  ]);
  const paidBy = new Map<string, number>();
  paid?.forEach((t) => paidBy.set(t.party_id, (paidBy.get(t.party_id) ?? 0) + Number(t.amount_paise)));
  const staffView = canSeeAll(me);

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Vendors & staff" subtitle="People and companies you pay" />
      <ErrorBanner message={error} />

      <form className="card flex gap-3">
        <select name="kind" defaultValue={kind ?? ""} className="input w-44">
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Name</th><th className="th">Type</th><th className="th">Contact</th><th className="th">GSTIN</th>
              {staffView && <th className="th text-right">Total paid</th>}
              {staffView && <th className="th" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {parties?.map((p) => (
              <tr key={p.id} className={p.is_active ? "" : "opacity-50"}>
                <td className="td font-medium">{p.name}</td>
                <td className="td">{KIND_LABEL[p.kind]}</td>
                <td className="td text-xs">{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</td>
                <td className="td">{p.gstin ?? "—"}</td>
                {staffView && <td className="td text-right">{formatINR(paidBy.get(p.id) ?? 0)}</td>}
                {staffView && me.role !== "viewer" && (
                  <td className="td">
                    <form action={setPartyActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="is_active" value={String(!p.is_active)} />
                      <button className="btn-ghost">{p.is_active ? "Deactivate" : "Activate"}</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite(me) && me.is_active && (
        <form action={addParty} className="card grid gap-3 sm:grid-cols-3">
          <p className="text-sm font-medium sm:col-span-3">Add payee</p>
          <Field label="Name"><input name="name" required className="input" /></Field>
          <Field label="Type">
            <select name="kind" className="input">
              {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Phone"><input name="phone" className="input" /></Field>
          <Field label="Email"><input name="email" type="email" className="input" /></Field>
          <Field label="GSTIN"><input name="gstin" className="input" /></Field>
          <Field label="State">
            <select name="state" className="input"><option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          <button className="btn-primary sm:col-span-3">Add</button>
        </form>
      )}
    </div>
  );
}
