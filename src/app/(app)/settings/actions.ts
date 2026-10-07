"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPaise } from "@/lib/money";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optId = (f: FormData, k: string) => str(f, k) || null;

function done(path: string, error?: string): never {
  revalidatePath(path);
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);
}

// ───────── departments (Owner) ─────────
export async function saveDepartment(formData: FormData) {
  await requireRole("owner");
  const supabase = await createClient();
  const id = str(formData, "id");
  const limit = str(formData, "limit");
  const row = {
    name: str(formData, "name"),
    approval_limit_paise: limit ? toPaise(limit) : null,
    is_active: id ? str(formData, "is_active") === "true" : true,
  };
  if (!row.name) done("/settings/departments", "Name is required");
  const { error } = id
    ? await supabase.from("departments").update(row).eq("id", id)
    : await supabase.from("departments").insert(row);
  done("/settings/departments", error?.message);
}

// ───────── categories (Owner / Finance) ─────────
export async function saveCategory(formData: FormData) {
  await requireRole("owner", "finance");
  const supabase = await createClient();
  const id = str(formData, "id");
  const { error } = id
    ? await supabase
        .from("categories")
        .update({ is_active: str(formData, "is_active") === "true" })
        .eq("id", id)
    : await supabase.from("categories").insert({
        name: str(formData, "name"),
        kind: str(formData, "kind"),
        department_id: optId(formData, "department_id"),
      });
  done("/settings/categories", error?.message);
}

// ───────── accounts (Owner / Finance) ─────────
export async function saveAccount(formData: FormData) {
  await requireRole("owner", "finance");
  const supabase = await createClient();
  const id = str(formData, "id");
  const { error } = id
    ? await supabase
        .from("accounts")
        .update({ is_active: str(formData, "is_active") === "true" })
        .eq("id", id)
    : await supabase.from("accounts").insert({
        name: str(formData, "name"),
        type: str(formData, "type"),
        opening_balance_paise: toPaise(str(formData, "opening") || "0"),
        reference: optId(formData, "reference"),
      });
  done("/settings/accounts", error?.message);
}

// ───────── users (Owner) ─────────
export async function updateUser(formData: FormData) {
  const me = await requireRole("owner");
  const id = str(formData, "id");
  const is_active = str(formData, "is_active") === "true";
  if (id === me.id && !is_active) done("/settings/users", "You cannot deactivate yourself");
  const role = str(formData, "role") as Role;
  if (id === me.id && role !== "owner") done("/settings/users", "You cannot change your own role");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role, department_id: optId(formData, "department_id"), is_active })
    .eq("id", id);
  done("/settings/users", error?.message);
}

export async function createUser(formData: FormData) {
  await requireRole("owner");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    done("/settings/users", "SUPABASE_SERVICE_ROLE_KEY is not set on the server");
  }
  const admin = createAdminClient();
  const email = str(formData, "email");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: str(formData, "password"),
    email_confirm: true,
    user_metadata: { full_name: str(formData, "full_name") },
  });
  if (error || !data.user) done("/settings/users", error?.message ?? "Could not create user");

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role: str(formData, "role"),
      department_id: optId(formData, "department_id"),
      is_active: true,
    })
    .eq("id", data!.user.id);
  done("/settings/users", profileError?.message);
}

// ───────── company & GST (Owner / Finance) ─────────
export async function saveCompany(formData: FormData) {
  await requireRole("owner", "finance");
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({
      name: str(formData, "name"),
      gstin: optId(formData, "gstin"),
      state: optId(formData, "state"),
      address: optId(formData, "address"),
      invoice_prefix: str(formData, "invoice_prefix"),
      sac_code: str(formData, "sac_code"),
      default_gst_rate: Number(str(formData, "default_gst_rate")) || 18,
      bank_details: optId(formData, "bank_details"),
    })
    .eq("id", 1);
  revalidatePath("/settings/company");
  redirect(error ? `/settings/company?error=${encodeURIComponent(error.message)}` : "/settings/company?saved=1");
}
