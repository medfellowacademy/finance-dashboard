"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function reconcile(formData: FormData) {
  await requireRole("owner", "finance");
  const supabase = await createClient();
  const ids = formData.getAll("ids").map(String);
  const account = String(formData.get("account") ?? "");
  if (ids.length) {
    const { error } = await supabase.rpc("set_reconciled", { p_ids: ids, p_val: true });
    if (error) redirect(`/reconcile?account=${account}&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/reconcile");
  redirect(`/reconcile?account=${account}`);
}
