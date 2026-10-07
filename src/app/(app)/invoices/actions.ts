"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeGst } from "@/lib/gst";

export async function createInvoice(formData: FormData) {
  const me = await getProfile();
  if (!me.is_active || !canWrite(me)) redirect("/invoices");
  const supabase = await createClient();
  const txnId = String(formData.get("transaction_id") ?? "");
  const fail = (m: string): never => redirect(`/money-in?error=${encodeURIComponent(m)}`);

  const { data: txn } = await supabase
    .from("transactions")
    .select(
      "id, txn_date, amount_paise, party_id, fee_plan_id, " +
        "parties(name, state, gstin), categories(name), fee_plans(gst_rate, gst_inclusive, courses(name))",
    )
    .eq("id", txnId)
    .eq("kind", "in")
    .single();
  if (!txn) return fail("Receipt not found");
  const t = txn as unknown as {
    id: string; amount_paise: number; party_id: string | null; fee_plan_id: string | null;
    parties: { name: string; state: string | null; gstin: string | null } | null;
    categories: { name: string } | null;
    fee_plans: { gst_rate: number; gst_inclusive: boolean; courses: { name: string } | null } | null;
  };

  const { data: company } = await supabase.from("company_settings").select("*").eq("id", 1).single();
  if (!company?.gstin) return fail("Add your company GSTIN under Settings → Company before creating invoices");

  const rate = Number(t.fee_plans?.gst_rate ?? company.default_gst_rate);
  const { taxable, gst, total } = computeGst(t.amount_paise, rate, t.fee_plans?.gst_inclusive ?? true);

  const customerState = t.parties?.state ?? null;
  const interState = !!customerState && !!company.state && customerState !== company.state;
  const cgst = interState ? 0 : Math.floor(gst / 2);
  const sgst = interState ? 0 : gst - cgst;
  const igst = interState ? gst : 0;

  const { data: invNo, error: noError } = await supabase.rpc("next_invoice_no");
  if (noError || !invNo) return fail(noError?.message ?? "Could not generate an invoice number");

  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({
      invoice_no: invNo,
      transaction_id: t.id,
      party_id: t.party_id,
      fee_plan_id: t.fee_plan_id,
      description: t.fee_plans?.courses?.name ?? t.categories?.name ?? "Fee",
      taxable_paise: taxable,
      gst_rate: rate,
      cgst_paise: cgst,
      sgst_paise: sgst,
      igst_paise: igst,
      total_paise: total,
      place_of_supply: customerState ?? company.state,
      sac_code: company.sac_code,
      company_gstin: company.gstin,
      customer_gstin: t.parties?.gstin ?? null,
    })
    .select("id")
    .single();
  if (error || !inv) return fail(error?.message ?? "Could not create the invoice");

  revalidatePath("/money-in");
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}

export async function cancelInvoice(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}
