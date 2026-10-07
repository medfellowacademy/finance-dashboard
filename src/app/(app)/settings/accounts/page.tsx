import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { saveAccount } from "../actions";

export const metadata = { title: "Accounts – Medfellow Finance" };

const TYPE_LABEL: Record<string, string> = {
  bank: "Bank account",
  upi: "UPI",
  cash: "Cash",
  gateway: "Payment gateway",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("owner", "finance");
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type, opening_balance_paise, reference, is_active")
    .order("name");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-zinc-500">
          Bank accounts, UPI IDs, cash and gateway wallets. Balance = opening balance + money
          in − money out.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Account</th>
              <th className="th">Type</th>
              <th className="th">Reference</th>
              <th className="th">Opening balance</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {accounts?.map((a) => (
              <tr key={a.id}>
                <td className="td font-medium">{a.name}</td>
                <td className="td">{TYPE_LABEL[a.type]}</td>
                <td className="td">{a.reference ?? "—"}</td>
                <td className="td">{formatINR(a.opening_balance_paise)}</td>
                <td className="td">{a.is_active ? "Active" : "Inactive"}</td>
                <td className="td">
                  <form action={saveAccount}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="is_active" value={String(!a.is_active)} />
                    <button className="btn-ghost">{a.is_active ? "Deactivate" : "Activate"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={saveAccount} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-zinc-500">Account name</label>
          <input name="name" required placeholder="e.g. HDFC Current ••1234" className="input" />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Type</label>
          <select name="type" className="input">
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500">Reference (optional)</label>
          <input name="reference" placeholder="Last 4 digits / UPI id" className="input" />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Opening balance (₹)</label>
          <input name="opening" type="number" step="0.01" defaultValue="0" className="input w-36" />
        </div>
        <button className="btn-primary">Add</button>
      </form>
    </div>
  );
}
