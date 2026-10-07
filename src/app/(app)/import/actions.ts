"use server";

import { revalidatePath } from "next/cache";
import { readSheet } from "read-excel-file/node";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toPaise } from "@/lib/money";

export type ImportState = { ok?: boolean; message: string; errors?: string[] } | null;

const MAX_ROWS = 5000;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); // Indian style DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export async function importLedger(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireRole("owner", "finance");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a .xlsx or .csv file" };
  if (file.size > 5 * 1024 * 1024) return { message: "File is larger than 5 MB" };

  let grid: unknown[][];
  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      grid = parseCsv((await file.text()).replace(/^﻿/, ""));
    } else if (file.name.toLowerCase().endsWith(".xlsx")) {
      grid = (await readSheet(Buffer.from(await file.arrayBuffer()))) as unknown[][];
    } else {
      return { message: "Only .xlsx and .csv files are supported (save .xls files as .xlsx first)" };
    }
  } catch {
    return { message: "Could not read that file. Is it a valid spreadsheet?" };
  }
  if (grid.length < 2) return { message: "The file has no data rows" };
  if (grid.length - 1 > MAX_ROWS) return { message: `Too many rows (max ${MAX_ROWS} per file)` };

  const headers = grid[0].map((h) => String(h ?? "").trim().toLowerCase());
  const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const idx = {
    type: col("type", "kind"), date: col("date"), amount: col("amount", "amount (inr)"),
    party: col("party", "name", "student", "payee"), dept: col("department", "dept"),
    category: col("category"), account: col("account"), mode: col("mode", "payment mode"),
    reference: col("reference", "ref", "utr"), notes: col("notes", "remarks"),
  };
  const missing = (["type", "date", "amount"] as const).filter((k) => idx[k] < 0);
  if (missing.length) return { message: `Missing column(s): ${missing.join(", ")}. Download the template for the exact headers.` };

  const supabase = await createClient();
  const [{ data: depts }, { data: cats }, { data: accs }, { data: parties }] = await Promise.all([
    supabase.from("departments").select("id, name"),
    supabase.from("categories").select("id, name, kind"),
    supabase.from("accounts").select("id, name"),
    supabase.from("parties").select("id, name, kind").limit(50000),
  ]);
  const byName = <T extends { name: string }>(list: T[] | null, n: string) =>
    list?.find((x) => x.name.toLowerCase() === n.toLowerCase());

  const errors: string[] = [];
  const modes = ["upi", "bank", "cash", "card", "gateway", "cheque"];
  const prepared: {
    kind: "in" | "out"; txn_date: string; amount_paise: number; department_id: string; category_id: string | null;
    account_id: string | null; mode: string | null; reference: string | null; notes: string | null; partyName: string | null;
  }[] = [];

  grid.slice(1).forEach((r, n) => {
    const line = n + 2;
    const get = (i: number) => (i < 0 ? "" : String(r[i] ?? "").trim());
    const err = (m: string) => errors.push(`Row ${line}: ${m}`);

    const t = get(idx.type).toLowerCase();
    const kind = ["in", "income", "received", "money in"].includes(t) ? "in" : ["out", "expense", "paid", "payment", "money out"].includes(t) ? "out" : null;
    if (!kind) return err(`Type "${get(idx.type)}" must be "in" or "out"`);

    const date = toIsoDate(idx.date >= 0 ? r[idx.date] : null);
    if (!date) return err(`Date "${get(idx.date)}" not understood (use YYYY-MM-DD or DD/MM/YYYY)`);

    const amount = toPaise(get(idx.amount).replace(/[₹,\s]/g, ""));
    if (!(amount > 0)) return err(`Amount "${get(idx.amount)}" must be a number greater than zero`);

    const dept = get(idx.dept) ? byName(depts, get(idx.dept)) : byName(depts, "Sales");
    if (!dept) return err(`Department "${get(idx.dept)}" does not exist`);

    let category_id: string | null = null;
    if (get(idx.category)) {
      const c = cats?.find((x) => x.name.toLowerCase() === get(idx.category).toLowerCase() && x.kind === kind);
      if (!c) return err(`Category "${get(idx.category)}" does not exist for money ${kind}`);
      category_id = c.id;
    }

    let account_id: string | null = null;
    if (get(idx.account)) {
      const a = byName(accs, get(idx.account));
      if (!a) return err(`Account "${get(idx.account)}" does not exist`);
      account_id = a.id;
    } else if (kind === "out") return err("Account is required for money out");

    const mode = get(idx.mode).toLowerCase() || null;
    if (mode && !modes.includes(mode)) return err(`Mode "${mode}" must be one of ${modes.join(", ")}`);

    prepared.push({
      kind, txn_date: date, amount_paise: amount, department_id: dept.id, category_id, account_id, mode,
      reference: get(idx.reference) || null, notes: get(idx.notes) || null, partyName: get(idx.party) || null,
    });
  });

  if (errors.length) {
    return { message: `Nothing was imported. Fix the ${errors.length} problem(s) below and upload again.`, errors: errors.slice(0, 50) };
  }

  // Create missing parties (students for money in, vendors for money out).
  const partyId = new Map<string, string>();
  for (const p of parties ?? []) partyId.set(`${p.kind === "student" ? "in" : "out"}|${p.name.toLowerCase()}`, p.id);
  const toCreate = new Map<string, { name: string; kind: string }>();
  for (const p of prepared) {
    if (!p.partyName) continue;
    const key = `${p.kind}|${p.partyName.toLowerCase()}`;
    if (!partyId.has(key) && !toCreate.has(key)) toCreate.set(key, { name: p.partyName, kind: p.kind === "in" ? "student" : "vendor" });
  }
  if (toCreate.size) {
    const entries = [...toCreate.entries()];
    const { data: created, error } = await supabase.from("parties").insert(entries.map(([, v]) => v)).select("id, name, kind");
    if (error) return { message: `Could not create parties: ${error.message}` };
    for (const c of created ?? []) partyId.set(`${c.kind === "student" ? "in" : "out"}|${c.name.toLowerCase()}`, c.id);
  }

  const rows = prepared.map(({ partyName, ...p }) => ({
    ...p,
    party_id: partyName ? partyId.get(`${p.kind}|${partyName.toLowerCase()}`) ?? null : null,
    status: p.kind === "in" ? "received" : "paid",
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("transactions").insert(rows.slice(i, i + 500));
    if (error) {
      return { message: `Stopped after ${i} rows were saved: ${error.message}. Do not re-upload the whole file; remove the rows already imported first.` };
    }
  }

  ["/", "/money-in", "/money-out", "/students", "/reports"].forEach((p) => revalidatePath(p));
  return { ok: true, message: `Imported ${rows.length} entries${toCreate.size ? ` and created ${toCreate.size} new parties` : ""}.` };
}
