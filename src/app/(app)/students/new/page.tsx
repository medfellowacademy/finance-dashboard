import { getProfile, isStaff } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { INDIAN_STATES, todayISO } from "@/lib/format";
import { createStudentPlan } from "../actions";

export const metadata = { title: "New student & plan – Medfellow Finance" };

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; student?: string }>;
}) {
  const me = await getProfile();
  if (!me.is_active || !(isStaff(me) || me.department_name === "Sales")) redirect("/students");
  const { error, student } = await searchParams;
  const supabase = await createClient();

  const [{ data: courses }, { data: company }, existing] = await Promise.all([
    supabase.from("courses").select("name").eq("is_active", true).order("name"),
    supabase.from("company_settings").select("default_gst_rate").eq("id", 1).single(),
    student ? supabase.from("parties").select("name").eq("id", student).single() : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title={existing.data ? `New fee plan for ${existing.data.name}` : "New student & fee plan"}
        subtitle="Fee is negotiated per student. Set the discount and how it is paid in installments."
      />
      <ErrorBanner message={error} />

      <form action={createStudentPlan} className="space-y-4">
        <input type="hidden" name="student_id" value={student ?? ""} />

        {!existing.data && (
          <section className="card grid gap-3 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Student</p>
            <Field label="Full name"><input name="name" required className="input" /></Field>
            <Field label="Phone"><input name="phone" className="input" /></Field>
            <Field label="Email"><input name="email" type="email" className="input" /></Field>
            <Field label="State (for GST)">
              <select name="state" className="input">
                <option value="">—</option>
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="GSTIN (only if billed to a business)"><input name="gstin" className="input" /></Field>
          </section>
        )}

        <section className="card grid gap-3 sm:grid-cols-2">
          <p className="text-sm font-medium sm:col-span-2">Fee</p>
          <Field label="Course / batch">
            <input name="course" list="courses" placeholder="Type or pick" className="input" />
            <datalist id="courses">{courses?.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          </Field>
          <Field label="Course fee (₹)"><input name="total" type="number" step="0.01" min="1" required className="input" /></Field>
          <Field label="Discount (₹)"><input name="discount" type="number" step="0.01" min="0" defaultValue="0" className="input" /></Field>
          <Field label="GST rate (%)"><input name="gst_rate" type="number" step="0.01" defaultValue={company?.default_gst_rate ?? 18} className="input" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="gst_inclusive" defaultChecked /> Fee already includes GST
          </label>
          <Field label="Notes" className="sm:col-span-2"><input name="notes" className="input" /></Field>
        </section>

        <section className="card grid gap-3 sm:grid-cols-3">
          <p className="text-sm font-medium sm:col-span-3">Installments</p>
          <Field label="Schedule type" className="sm:col-span-3">
            <select name="schedule_mode" className="input max-w-xs">
              <option value="equal">Equal installments</option>
              <option value="custom">Custom dates & amounts</option>
            </select>
          </Field>
          <Field label="Number of installments"><input name="count" type="number" min="1" max="60" defaultValue="3" className="input" /></Field>
          <Field label="First due date"><input name="first_due" type="date" defaultValue={todayISO()} className="input" /></Field>
          <Field label="Days between installments"><input name="every_days" type="number" min="1" defaultValue="30" className="input" /></Field>
          <Field label="Custom schedule (only if “Custom” is chosen) – one per line: YYYY-MM-DD, amount" className="sm:col-span-3">
            <textarea name="custom" rows={4} placeholder={"2026-11-05, 20000\n2026-12-05, 15000"} className="input font-mono" />
          </Field>
        </section>

        <button className="btn-primary">Save student & plan</button>
      </form>
    </div>
  );
}
