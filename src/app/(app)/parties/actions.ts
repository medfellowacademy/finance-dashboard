"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;

export async function addParty(formData: FormData) {
  const me = await getProfile();
  if (!me.is_active || !canWrite(me)) redirect("/parties");
  const supabase = await createClient();
  const { error } = await supabase.from("parties").insert({
    name: str(formData, "name"),
    kind: str(formData, "kind"),
    phone: opt(formData, "phone"),
    email: opt(formData, "email"),
    gstin: opt(formData, "gstin"),
    state: opt(formData, "state"),
  });
  revalidatePath("/parties");
  redirect(error ? `/parties?error=${encodeURIComponent(error.message)}` : "/parties");
}

export async function setPartyActive(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("parties")
    .update({ is_active: str(formData, "is_active") === "true" })
    .eq("id", str(formData, "id"));
  revalidatePath("/parties");
  redirect(error ? `/parties?error=${encodeURIComponent(error.message)}` : "/parties");
}
