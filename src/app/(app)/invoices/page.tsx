import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Invoices – Medfellow Finance" };

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, invoice_no, invoice_date, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, status, parties(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as {
    id: string; invoice_no: string; invoice_date: string; taxable_paise: number; cgst_paise: number;
    sgst_paise: number; igst_paise: number; total_paise: number; status: string; parties: { name: string } | null;
  }[];

  return (
    <div className="space-y-5">
      <PageHeader title="GST invoices" subtitle="Create an invoice from any receipt on the Money In page" />
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Invoice</th><th className="th">Date</th><th className="th">Customer</th>
              <th className="th text-right">Taxable</th><th className="th text-right">GST</th>
              <th className="th text-right">Total</th><th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="td font-medium"><Link className="underline" href={`/invoices/${i.id}`}>{i.invoice_no}</Link></td>
                <td className="td">{fmtDate(i.invoice_date)}</td>
                <td className="td">{i.parties?.name ?? "—"}</td>
                <td className="td text-right">{formatINR(i.taxable_paise)}</td>
                <td className="td text-right">{formatINR(i.cgst_paise + i.sgst_paise + i.igst_paise)}</td>
                <td className="td text-right font-medium">{formatINR(i.total_paise)}</td>
                <td className="td">{i.status === "cancelled" ? <span className="text-red-600">Cancelled</span> : "Issued"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="td py-8 text-center text-zinc-500">No invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
