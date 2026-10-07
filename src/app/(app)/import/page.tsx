import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import – Medfellow Finance" };

export default async function ImportPage() {
  await requireRole("owner", "finance");
  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Import from Excel" subtitle="Bring in your existing payment records (.xlsx or .csv)" />
      <div className="card space-y-2 text-sm text-zinc-700">
        <p className="font-medium">How it works</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li><a className="underline" href="/import/template">Download the template</a> and paste your records in.</li>
          <li>Departments, categories and accounts must already exist (create them under Settings first). Names must match.</li>
          <li>Students (money in) and vendors (money out) that do not exist are created automatically.</li>
          <li>If any row has a problem, <b>nothing</b> is imported and you get a list of the problems to fix.</li>
        </ol>
        <p className="text-xs text-zinc-500">
          Columns: Type (in/out), Date, Amount, Party, Department, Category, Account, Mode, Reference, Notes. Money out
          rows are recorded as already paid and need an Account. Fee plans are created from the Students page.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
