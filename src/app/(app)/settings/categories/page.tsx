import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveCategory } from "../actions";

export const metadata = { title: "Categories – Medfellow Finance" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("owner", "finance");
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: categories }, { data: departments }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, kind, is_active, departments(name)")
      .order("kind")
      .order("name"),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-zinc-500">
          Every payment in or out is filed under a category. Restrict a category to one
          department, or leave it for all.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Category</th>
              <th className="th">Type</th>
              <th className="th">Department</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {categories?.map((c) => {
              const dept = (c.departments as unknown as { name: string } | null)?.name;
              return (
                <tr key={c.id}>
                  <td className="td font-medium">{c.name}</td>
                  <td className="td">{c.kind === "in" ? "Money in" : "Money out"}</td>
                  <td className="td">{dept ?? "All"}</td>
                  <td className="td">{c.is_active ? "Active" : "Inactive"}</td>
                  <td className="td">
                    <form action={saveCategory}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="is_active" value={String(!c.is_active)} />
                      <button className="btn-ghost">{c.is_active ? "Deactivate" : "Activate"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form action={saveCategory} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-zinc-500">New category</label>
          <input name="name" required placeholder="e.g. Webinar income" className="input" />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Type</label>
          <select name="kind" className="input">
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-500">Department</label>
          <select name="department_id" className="input">
            <option value="">All departments</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Add</button>
      </form>
    </div>
  );
}
