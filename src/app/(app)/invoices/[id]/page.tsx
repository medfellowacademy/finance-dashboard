import { notFound } from "next/navigation";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import { cancelInvoice } from "../actions";

export const metadata = { title: "Invoice – Medfellow Finance" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  const supabase = await createClient();

  const [{ data }, { data: company }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, parties(name, phone, email, state, gstin)")
      .eq("id", id)
      .single(),
    supabase.from("company_settings").select("*").eq("id", 1).single(),
  ]);
  if (!data) notFound();
  const inv = data as typeof data & {
    parties: { name: string; phone: string | null; email: string | null; state: string | null; gstin: string | null } | null;
  };
  const cancelled = inv.status === "cancelled";
  const half = inv.cgst_paise > 0 || inv.sgst_paise > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex justify-between print:hidden">
        <PrintButton />
        {isStaff(me) && !cancelled && (
          <form action={cancelInvoice}>
            <input type="hidden" name="id" value={inv.id} />
            <button className="btn-ghost text-red-600">Cancel invoice</button>
          </form>
        )}
      </div>

      <article className="relative rounded-xl border border-zinc-200 bg-white p-8 text-sm shadow-sm print:border-0 print:shadow-none">
        {cancelled && (
          <p className="absolute right-8 top-8 rotate-6 rounded border-2 border-red-600 px-3 py-1 text-xl font-bold text-red-600">
            CANCELLED
          </p>
        )}
        <header className="flex justify-between gap-6 border-b border-zinc-200 pb-4">
          <div>
            <h1 className="text-xl font-semibold">{company?.name}</h1>
            <p className="whitespace-pre-line text-zinc-600">{company?.address}</p>
            <p className="mt-1">GSTIN: <b>{inv.company_gstin}</b></p>
            {company?.state && <p>State: {company.state}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">TAX INVOICE</p>
            <p>No: <b>{inv.invoice_no}</b></p>
            <p>Date: {fmtDate(inv.invoice_date)}</p>
          </div>
        </header>

        <section className="grid gap-4 py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-zinc-500">Billed to</p>
            <p className="font-medium">{inv.parties?.name ?? "—"}</p>
            {inv.parties?.phone && <p>{inv.parties.phone}</p>}
            {inv.parties?.email && <p>{inv.parties.email}</p>}
            {inv.customer_gstin && <p>GSTIN: {inv.customer_gstin}</p>}
          </div>
          <div>
            <p className="text-xs uppercase text-zinc-500">Place of supply</p>
            <p>{inv.place_of_supply ?? "—"}</p>
            <p className="text-xs uppercase text-zinc-500 mt-2">SAC</p>
            <p>{inv.sac_code}</p>
          </div>
        </section>

        <table className="w-full border-y border-zinc-200">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Taxable value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2">{inv.description}</td>
              <td className="py-2 text-right">{formatINR(inv.taxable_paise)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-3 max-w-xs space-y-1">
          {half ? (
            <>
              <div className="flex justify-between"><dt>CGST @ {Number(inv.gst_rate) / 2}%</dt><dd>{formatINR(inv.cgst_paise)}</dd></div>
              <div className="flex justify-between"><dt>SGST @ {Number(inv.gst_rate) / 2}%</dt><dd>{formatINR(inv.sgst_paise)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between"><dt>IGST @ {Number(inv.gst_rate)}%</dt><dd>{formatINR(inv.igst_paise)}</dd></div>
          )}
          <div className="flex justify-between border-t border-zinc-300 pt-1 text-base font-semibold">
            <dt>Total</dt><dd>{formatINR(inv.total_paise)}</dd>
          </div>
        </dl>

        {company?.bank_details && (
          <footer className="mt-6 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
            <p className="font-medium">Bank details</p>
            <p className="whitespace-pre-line">{company.bank_details}</p>
          </footer>
        )}
        <p className="mt-6 text-center text-xs text-zinc-400">This is a computer-generated invoice.</p>
      </article>
    </div>
  );
}
