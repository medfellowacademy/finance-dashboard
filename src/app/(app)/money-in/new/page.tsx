import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { MODE_LABEL, todayISO } from "@/lib/format";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { addReceipt } from "../actions";

export const metadata = { title: "Record receipt – Medfellow Finance" };

type Search = { error?: string; student?: string; plan?: string; amount?: string; return_to?: string };

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await getProfile();
  const sp = await searchParams;
  const staff = isStaff(me);
  const supabase = await createClient();
  const { departments, categories, accounts } = await getLookups();

  const { data: students } = await supabase
    .from("parties")
    .select("id, name, phone")
    .eq("kind", "student")
    .eq("is_active", true)
    .order("name")
    .limit(2000);

  const { data: plans } = sp.student
    ? await supabase
        .from("fee_plans")
        .select("id, total_paise, discount_paise, courses(name)")
        .eq("student_id", sp.student)
        .eq("status", "active")
    : { data: [] };

  const inCategories = categories.filter((c) => c.kind === "in");
  const defaultCategory = inCategories.find((c) => c.name === "Student fee")?.id;
  const salesDept = departments.find((d) => d.name === "Sales")?.id;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Record receipt" subtitle="Money received from a student or any other source" />
      <ErrorBanner message={sp.error} />

      <form className="card flex items-end gap-3">
        <Field label="Student (optional – pick to link a fee plan)" className="flex-1">
          <select name="student" defaultValue={sp.student ?? ""} className="input">
            <option value="">— not a student / other income —</option>
            {students?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ""}</option>
            ))}
          </select>
        </Field>
        <button className="btn-ghost">Load plans</button>
      </form>

      <form action={addReceipt} className="card grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="party_id" value={sp.student ?? ""} />
        <input type="hidden" name="return_to" value={sp.return_to ?? ""} />

        {sp.student && (
          <Field label="Fee plan" className="sm:col-span-2">
            <select name="fee_plan_id" defaultValue={sp.plan ?? plans?.[0]?.id ?? ""} className="input">
              <option value="">— none —</option>
              {plans?.map((p) => {
                const course = (p.courses as unknown as { name: string } | null)?.name ?? "Fee plan";
                return <option key={p.id} value={p.id}>{course} – {formatINR(p.total_paise - p.discount_paise)}</option>;
              })}
            </select>
          </Field>
        )}

        <Field label="Amount received (₹)">
          <input name="amount" type="number" step="0.01" min="0.01" required defaultValue={sp.amount} className="input" />
        </Field>
        <Field label="Date">
          <input name="txn_date" type="date" required defaultValue={todayISO()} className="input" />
        </Field>
        <Field label="Payment mode">
          <select name="mode" required className="input">
            {Object.entries(MODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR / cheque no.">
          <input name="reference" className="input" />
        </Field>
        <Field label="Category">
          <select name="category_id" defaultValue={defaultCategory} className="input">
            {inCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {staff ? (
          <>
            <Field label="Department">
              <select name="department_id" defaultValue={salesDept} className="input">
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Received into account" className="sm:col-span-2">
              <select name="account_id" className="input">
                <option value="">— assign later —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <p className="text-xs text-zinc-500 sm:col-span-2">
            Finance will assign the bank account. Cash receipts go to the cash box automatically.
          </p>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <input name="notes" className="input" />
        </Field>
        <Field label="Screenshot / receipt (optional, max 8 MB)" className="sm:col-span-2">
          <input name="attachment" type="file" accept="image/*,application/pdf" className="input" />
        </Field>
        <button className="btn-primary sm:col-span-2">Save receipt</button>
      </form>
    </div>
  );
}
