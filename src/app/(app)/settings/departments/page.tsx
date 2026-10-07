import { getProfile } from "@/lib/auth";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { saveDepartment } from "../actions";

export const metadata = { title: "Departments – Medfellow Finance" };

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("owner", "finance");
  const { role } = await getProfile();
  const canEdit = role === "owner";
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, approval_limit_paise, is_active")
    .order("name");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Departments</h1>
        <p className="text-sm text-zinc-500">
          Payments above a department&apos;s approval limit need Owner approval. Leave the
          limit empty for no limit.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Department</th>
              <th className="th">Approval limit (₹)</th>
              <th className="th">Status</th>
              {canEdit && <th className="th" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {departments?.map((d) => (
              <tr key={d.id}>
                {canEdit ? (
                  <>
                    <td className="td font-medium">
                      <form id={`d-${d.id}`} action={saveDepartment}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="name" value={d.name} />
                      </form>
                      {d.name}
                    </td>
                    <td className="td">
                      <input
                        form={`d-${d.id}`}
                        name="limit"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={d.approval_limit_paise != null ? d.approval_limit_paise / 100 : ""}
                        placeholder="No limit"
                        className="input w-36"
                      />
                    </td>
                    <td className="td">
                      <select
                        form={`d-${d.id}`}
                        name="is_active"
                        defaultValue={String(d.is_active)}
                        className="input w-28"
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </td>
                    <td className="td">
                      <button form={`d-${d.id}`} className="btn-ghost">Save</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="td font-medium">{d.name}</td>
                    <td className="td">{formatINR(d.approval_limit_paise)}</td>
                    <td className="td">{d.is_active ? "Active" : "Inactive"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form action={saveDepartment} className="card flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-zinc-500">New department</label>
            <input name="name" required placeholder="e.g. Marketing" className="input" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Approval limit (₹)</label>
            <input name="limit" type="number" min="0" step="0.01" placeholder="No limit" className="input w-36" />
          </div>
          <button className="btn-primary">Add</button>
        </form>
      )}
    </div>
  );
}
