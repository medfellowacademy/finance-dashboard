"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, canWrite, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveAttachment } from "@/lib/attachments";
import { toPaise } from "@/lib/money";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

export async function addReceipt(formData: FormData) {
  const me = await getProfile();
  if (!me.is_active || !canWrite(me)) redirect("/money-in");

  const supabase = await createClient();
  const back = (msg: string) => redirect(`/money-in/new?error=${encodeURIComponent(msg)}&student=${str(formData, "party_id")}`);

  const amount = toPaise(str(formData, "amount"));
  if (!(amount > 0)) back("Enter an amount greater than zero");

  // Receipts belong to the department of the person recording them; staff choose.
  const department_id = isStaff(me) ? str(formData, "department_id") : me.department_id;
  if (!department_id) back("Your account has no department. Ask the Owner to assign one.");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      kind: "in",
      txn_date: str(formData, "txn_date"),
      amount_paise: amount,
      department_id,
      category_id: opt(formData, "category_id"),
      party_id: opt(formData, "party_id"),
      fee_plan_id: opt(formData, "fee_plan_id"),
      account_id: isStaff(me) ? opt(formData, "account_id") : null,
      mode: str(formData, "mode"),
      reference: opt(formData, "reference"),
      notes: opt(formData, "notes"),
    })
    .select("id")
    .single();
  if (error || !data) back(error?.message ?? "Could not save the receipt");

  try {
    await saveAttachment(data!.id, formData.get("attachment"));
  } catch (e) {
    revalidatePath("/money-in");
    redirect(`/money-in?error=${encodeURIComponent("Saved, but the file failed: " + (e as Error).message)}`);
  }

  revalidatePath("/money-in");
  revalidatePath("/students");
  revalidatePath("/");
  const next = str(formData, "return_to");
  redirect(next.startsWith("/") ? next : "/money-in");
}

export async function assignAccount(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_account", {
    p_id: str(formData, "id"),
    p_account: str(formData, "account_id"),
  });
  revalidatePath("/money-in");
  revalidatePath("/reconcile");
  if (error) redirect(`/money-in?error=${encodeURIComponent(error.message)}`);
  redirect("/money-in");
}

export async function deleteTransaction(formData: FormData) {
  const supabase = await createClient();
  const back = str(formData, "return_to") || "/money-in";
  const { error } = await supabase.rpc("delete_transaction", { p_id: str(formData, "id") });
  revalidatePath(back);
  revalidatePath("/");
  redirect(error ? `${back}?error=${encodeURIComponent(error.message)}` : back);
}
