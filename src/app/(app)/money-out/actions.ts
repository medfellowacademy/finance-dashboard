"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, canWrite, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveAttachment } from "@/lib/attachments";
import { toPaise } from "@/lib/money";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

export async function requestPayment(formData: FormData) {
  const me = await getProfile();
  if (!me.is_active || !canWrite(me)) redirect("/money-out");
  const supabase = await createClient();
  const fail = (m: string): never => redirect(`/money-out/new?error=${encodeURIComponent(m)}`);

  const amount = toPaise(str(formData, "amount"));
  if (!(amount > 0)) return fail("Enter an amount greater than zero");
  const department_id = isStaff(me) ? str(formData, "department_id") : me.department_id;
  if (!department_id) return fail("Your account has no department. Ask the Owner to assign one.");
  if (!str(formData, "category_id")) return fail("Choose a category");

  // Payee: existing party, or create a new one from the typed name.
  let partyId = opt(formData, "party_id");
  const newName = str(formData, "new_party");
  if (!partyId && newName) {
    const { data, error } = await supabase
      .from("parties")
      .insert({ name: newName, kind: str(formData, "new_party_kind") || "vendor" })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not create the payee");
    partyId = data.id;
  }
  if (!partyId) return fail("Choose who is being paid");

  const alreadyPaid = isStaff(me) && formData.get("already_paid") === "on" && !!str(formData, "account_id");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      kind: "out",
      txn_date: str(formData, "txn_date"),
      amount_paise: amount,
      department_id,
      category_id: str(formData, "category_id"),
      party_id: partyId,
      mode: opt(formData, "mode"),
      reference: opt(formData, "reference"),
      notes: opt(formData, "notes"),
      account_id: alreadyPaid ? str(formData, "account_id") : null,
      status: alreadyPaid ? "paid" : "requested",
    })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Could not save the payment");

  try {
    await saveAttachment(data.id, formData.get("attachment"));
  } catch (e) {
    revalidatePath("/money-out");
    redirect(`/money-out?error=${encodeURIComponent("Saved, but the file failed: " + (e as Error).message)}`);
  }

  revalidatePath("/money-out");
  revalidatePath("/");
  redirect("/money-out");
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  revalidatePath("/money-out");
  revalidatePath("/");
  revalidatePath("/reconcile");
  redirect(error ? `/money-out?error=${encodeURIComponent(error.message)}` : "/money-out");
}

export async function decidePayment(formData: FormData) {
  await rpc("approve_payment", { p_id: str(formData, "id"), p_approve: str(formData, "decision") === "approve" });
}

export async function markPaid(formData: FormData) {
  await rpc("mark_paid", {
    p_id: str(formData, "id"),
    p_account: str(formData, "account_id"),
    p_date: str(formData, "paid_date"),
    p_ref: str(formData, "reference"),
  });
}

export async function cancelPayment(formData: FormData) {
  await rpc("cancel_payment", { p_id: str(formData, "id") });
}
