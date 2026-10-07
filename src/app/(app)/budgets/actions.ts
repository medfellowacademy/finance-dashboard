"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toPaise } from "@/lib/money";

export async function saveBudget(formData: FormData) {
  await requireRole("owner", "finance");
  const supabase = await createClient();
  const month = String(formData.get("month"));
  const { error } = await supabase.from("budgets").upsert(
    {
      department_id: String(formData.get("department_id")),
      month,
      amount_paise: toPaise(String(formData.get("amount") || "0")),
    },
    { onConflict: "department_id,month" },
  );
  const path = `/budgets?month=${month.slice(0, 7)}`;
  revalidatePath("/budgets");
  redirect(error ? `${path}&error=${encodeURIComponent(error.message)}` : path);
}
