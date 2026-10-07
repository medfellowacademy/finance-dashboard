import { NextResponse } from "next/server";
import { getLedger } from "@/lib/report";

const cell = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  // Guard against spreadsheet formula injection, then quote.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from") ?? "1970-01-01";
  const to = sp.get("to") ?? "2999-12-31";
  const rows = await getLedger({ from, to, dept: sp.get("dept") || undefined });

  const header = ["Date", "Type", "Party", "Department", "Category", "Account", "Mode", "Reference", "Notes", "Amount (INR)"];
  const lines = rows.map((r) =>
    [
      r.txn_date, r.kind === "in" ? "Money in" : "Money out", r.parties?.name, r.departments?.name,
      r.categories?.name, r.accounts?.name, r.mode, r.reference, r.notes, (Number(r.amount_paise) / 100).toFixed(2),
    ].map(cell).join(","),
  );
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="medfellow-ledger-${from}-to-${to}.csv"`,
    },
  });
}
