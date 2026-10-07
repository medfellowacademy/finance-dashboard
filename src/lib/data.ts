import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Option = { id: string; name: string };

/** Lookup lists used by forms and filters. RLS decides what each role can see. */
export async function getLookups() {
  const supabase = await createClient();
  const [departments, categories, accounts] = await Promise.all([
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id, name, kind, department_id").eq("is_active", true).order("name"),
    supabase.from("accounts").select("id, name, type").eq("is_active", true).order("name"),
  ]);
  return {
    departments: (departments.data ?? []) as Option[],
    categories: (categories.data ?? []) as (Option & { kind: "in" | "out"; department_id: string | null })[],
    accounts: (accounts.data ?? []) as (Option & { type: string })[],
  };
}

/** Sum helper for paise amounts. */
export const sum = (rows: { amount_paise: number }[] | null | undefined) =>
  (rows ?? []).reduce((a, r) => a + Number(r.amount_paise), 0);

/** Ledger rows that count towards balances. */
export const COUNTED_STATUSES = ["received", "paid"];

export type Txn = {
  id: string;
  kind: "in" | "out";
  txn_date: string;
  amount_paise: number;
  account_id: string | null;
  department_id: string;
  category_id: string | null;
  party_id: string | null;
  fee_plan_id: string | null;
  mode: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  reconciled: boolean;
  created_at: string;
};
