import { getProfile, canSeeAll } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data";
import { getLedger, groupSum } from "@/lib/report";
import { formatINR } from "@/lib/money";
import { fmtDate, MODE_LABEL, todayISO } from "@/lib/format";
import { Field, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Reports – Medfellow Finance" };

function financialYearStart() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

function SummaryTable({ title, rows }: { title: string; rows: ReturnType<typeof groupSum> }) {
  return (
    <section className="card p-0">
      <h2 className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold">{title}</h2>
      <table className="w-full">
        <thead><tr><th className="th">Name</th><th className="th text-right">In</th><th className="th text-right">Out</th><th className="th text-right">Net</th></tr></thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="td">{r.name}</td>
              <td className="td text-right text-emerald-700">{r.in ? formatINR(r.in) : "—"}</td>
              <td className="td text-right text-rose-700">{r.out ? formatINR(r.out) : "—"}</td>
              <td className="td text-right font-medium">{formatINR(r.net)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="td text-center text-zinc-500">No data</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dept?: string }>;
}) {
  const me = await getProfile();
  const sp = await searchParams;
  const from = sp.from || financialYearStart();
  const to = sp.to || todayISO();
  const { departments } = await getLookups();
  const supabase = await createClient();

  const rows = await getLedger({ from, to, dept: sp.dept });
  const totalIn = rows.filter((r) => r.kind === "in").reduce((a, r) => a + Number(r.amount_paise), 0);
  const totalOut = rows.filter((r) => r.kind === "out").reduce((a, r) => a + Number(r.amount_paise), 0);

  const { data: inv } = await supabase
    .from("invoices")
    .select("taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise")
    .eq("status", "issued")
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .limit(20000);
  const gst = (inv ?? []).reduce(
    (a, i) => ({
      taxable: a.taxable + Number(i.taxable_paise), cgst: a.cgst + Number(i.cgst_paise),
      sgst: a.sgst + Number(i.sgst_paise), igst: a.igst + Number(i.igst_paise), total: a.total + Number(i.total_paise),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
  );

  const exportQs = new URLSearchParams({ from, to, ...(sp.dept ? { dept: sp.dept } : {}) }).toString();
  const byMonth = groupSum(rows, (r) => r.txn_date.slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle={`${fmtDate(from)} – ${fmtDate(to)} · money actually received and paid`}>
        <a href={`/reports/export?${exportQs}`} className="btn-ghost print:hidden">Download Excel (CSV)</a>
        <PrintButton label="Print / PDF" />
      </PageHeader>

      <form className="card flex flex-wrap items-end gap-3 print:hidden">
        <Field label="From"><input type="date" name="from" defaultValue={from} className="input" /></Field>
        <Field label="To"><input type="date" name="to" defaultValue={to} className="input" /></Field>
        {canSeeAll(me) && (
          <Field label="Department">
            <select name="dept" defaultValue={sp.dept ?? ""} className="input">
              <option value="">All</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <button className="btn-primary">Apply</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-xs uppercase text-zinc-500">Money in</p><p className="text-2xl font-semibold text-emerald-700">{formatINR(totalIn)}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Money out</p><p className="text-2xl font-semibold text-rose-700">{formatINR(totalOut)}</p></div>
        <div className="card"><p className="text-xs uppercase text-zinc-500">Net</p><p className="text-2xl font-semibold">{formatINR(totalIn - totalOut)}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryTable title="By department" rows={groupSum(rows, (r) => r.departments?.name ?? "")} />
        <SummaryTable title="By category" rows={groupSum(rows, (r) => r.categories?.name ?? "")} />
        <SummaryTable title="By month" rows={byMonth} />
        <SummaryTable title="By payment mode" rows={groupSum(rows, (r) => (r.mode ? MODE_LABEL[r.mode] : ""))} />
      </div>

      <section className="card">
        <h2 className="text-sm font-semibold">GST summary (invoices issued)</h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-5">
          <div><dt className="text-xs text-zinc-500">Taxable value</dt><dd>{formatINR(gst.taxable)}</dd></div>
          <div><dt className="text-xs text-zinc-500">CGST</dt><dd>{formatINR(gst.cgst)}</dd></div>
          <div><dt className="text-xs text-zinc-500">SGST</dt><dd>{formatINR(gst.sgst)}</dd></div>
          <div><dt className="text-xs text-zinc-500">IGST</dt><dd>{formatINR(gst.igst)}</dd></div>
          <div><dt className="text-xs text-zinc-500">Invoiced total</dt><dd className="font-medium">{formatINR(gst.total)}</dd></div>
        </dl>
      </section>

      <section className="card p-0">
        <h2 className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold">Cash book</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="th">Date</th><th className="th">Party</th><th className="th">Dept</th><th className="th">Category</th>
              <th className="th">Account</th><th className="th text-right">In</th><th className="th text-right">Out</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.slice(-1000).map((r) => (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                  <td className="td">{r.parties?.name ?? "—"}</td>
                  <td className="td">{r.departments?.name}</td>
                  <td className="td">{r.categories?.name ?? "—"}</td>
                  <td className="td">{r.accounts?.name ?? "—"}</td>
                  <td className="td text-right text-emerald-700">{r.kind === "in" ? formatINR(r.amount_paise) : ""}</td>
                  <td className="td text-right text-rose-700">{r.kind === "out" ? formatINR(r.amount_paise) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 1000 && <p className="px-4 py-2 text-xs text-zinc-500">Showing the latest 1,000 rows. Download the CSV for everything.</p>}
      </section>
    </div>
  );
}
