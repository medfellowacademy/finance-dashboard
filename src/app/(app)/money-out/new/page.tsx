import { redirect } from "next/navigation";
import { getProfile, canWrite, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { MODE_LABEL, todayISO } from "@/lib/format";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { requestPayment } from "../actions";

export const metadata = { title: "New payment – Medfellow Finance" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await getProfile();
  if (!me.is_active || !canWrite(me)) redirect("/money-out");
  const { error } = await searchParams;
  const staff = isStaff(me);
  const supabase = await createClient();
  const { departments, categories, accounts } = await getLookups();

  const { data: payees } = await supabase
    .from("parties")
    .select("id, name, kind")
    .neq("kind", "student")
    .eq("is_active", true)
    .order("name")
    .limit(2000);

  let limitNote = "";
  if (me.department_id) {
    const { data: dept } = await supabase.from("departments").select("approval_limit_paise").eq("id", me.department_id).single();
    if (dept?.approval_limit_paise != null) {
      limitNote = `Payments above ${formatINR(dept.approval_limit_paise)} need Owner approval. Smaller ones are approved automatically.`;
    }
  }

  const outCategories = categories.filter(
    (c) => c.kind === "out" && (staff || !c.department_id || c.department_id === me.department_id),
  );

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="New payment" subtitle={limitNote || "Request a payment to a vendor, staff member or other payee"} />
      <ErrorBanner message={error} />

      <form action={requestPayment} className="card grid gap-3 sm:grid-cols-2">
        {staff && (
          <Field label="Department" className="sm:col-span-2">
            <select name="department_id" required className="input">
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Pay to (existing)">
          <select name="party_id" className="input">
            <option value="">— choose —</option>
            {payees?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kind})</option>)}
          </select>
        </Field>
        <Field label="…or add a new payee">
          <div className="flex gap-1">
            <input name="new_party" placeholder="Name" className="input" />
            <select name="new_party_kind" className="input w-28">
              <option value="vendor">Vendor</option><option value="employee">Staff</option><option value="other">Other</option>
            </select>
          </div>
        </Field>
        <Field label="Category">
          <select name="category_id" required className="input">
            <option value="">— choose —</option>
            {outCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Amount (₹)"><input name="amount" type="number" step="0.01" min="0.01" required className="input" /></Field>
        <Field label="Payment / due date"><input name="txn_date" type="date" required defaultValue={todayISO()} className="input" /></Field>
        <Field label="Mode">
          <select name="mode" className="input">
            <option value="">—</option>
            {Object.entries(MODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Invoice / bill no." className="sm:col-span-2"><input name="reference" className="input" /></Field>
        <Field label="Reason / notes" className="sm:col-span-2"><input name="notes" required className="input" /></Field>
        <Field label="Bill / receipt (optional, max 8 MB)" className="sm:col-span-2">
          <input name="attachment" type="file" accept="image/*,application/pdf" className="input" />
        </Field>

        {staff && (
          <div className="rounded-md bg-zinc-50 p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="already_paid" /> Already paid – record straight into the ledger
            </label>
            <Field label="Paid from account" className="mt-2">
              <select name="account_id" className="input">
                <option value="">—</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
        )}
        <button className="btn-primary sm:col-span-2">Submit payment</button>
      </form>
    </div>
  );
}
