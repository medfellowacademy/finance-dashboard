import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ErrorBanner, Field, PageHeader } from "@/components/ui";
import { INDIAN_STATES } from "@/lib/format";
import { saveCompany } from "../actions";

export const metadata = { title: "Company & GST – Medfellow Finance" };

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole("owner", "finance");
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: c } = await supabase.from("company_settings").select("*").eq("id", 1).single();

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Company & GST" subtitle="Printed on every GST invoice" />
      <ErrorBanner message={error} />
      {saved && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Saved.</p>}
      <form action={saveCompany} className="card grid gap-3 sm:grid-cols-2">
        <Field label="Company name"><input name="name" required defaultValue={c?.name} className="input" /></Field>
        <Field label="GSTIN"><input name="gstin" defaultValue={c?.gstin ?? ""} className="input" /></Field>
        <Field label="Registered state (decides CGST+SGST vs IGST)">
          <select name="state" defaultValue={c?.state ?? ""} className="input">
            <option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Invoice prefix"><input name="invoice_prefix" required defaultValue={c?.invoice_prefix} className="input" /></Field>
        <Field label="SAC code"><input name="sac_code" required defaultValue={c?.sac_code} className="input" /></Field>
        <Field label="Default GST rate (%)"><input name="default_gst_rate" type="number" step="0.01" defaultValue={c?.default_gst_rate} className="input" /></Field>
        <Field label="Address" className="sm:col-span-2"><textarea name="address" rows={3} defaultValue={c?.address ?? ""} className="input" /></Field>
        <Field label="Bank details shown on invoices" className="sm:col-span-2"><textarea name="bank_details" rows={3} defaultValue={c?.bank_details ?? ""} className="input" /></Field>
        <p className="text-xs text-zinc-500 sm:col-span-2">The SAC code and GST rate are starting values. Please confirm both with your CA.</p>
        <button className="btn-primary sm:col-span-2">Save</button>
      </form>
    </div>
  );
}
