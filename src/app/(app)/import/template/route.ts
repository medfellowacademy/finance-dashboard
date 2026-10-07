export function GET() {
  const csv =
    "Type,Date,Amount,Party,Department,Category,Account,Mode,Reference,Notes\r\n" +
    "in,2026-04-10,15000,Asha Verma,Sales,Student fee,Cash box,cash,,First installment\r\n" +
    "out,2026-04-12,42000,Zoom India,Operations,Software & subscriptions,Cash box,bank,INV-221,Annual plan\r\n";
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="medfellow-import-template.csv"',
    },
  });
}
