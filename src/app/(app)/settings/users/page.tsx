import { requireRole, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createUser, updateUser } from "../actions";

export const metadata = { title: "Users – Medfellow Finance" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("owner");
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: users }, { data: departments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, department_id, is_active")
      .order("created_at"),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
  ]);

  const roleOptions = Object.entries(ROLE_LABEL).map(([v, l]) => (
    <option key={v} value={v}>{l}</option>
  ));
  const deptOptions = departments?.map((d) => (
    <option key={d.id} value={d.id}>{d.name}</option>
  ));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-zinc-500">
          Department heads and users only see their own department. People who sign up
          themselves stay inactive until you activate them here.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Department</th>
              <th className="th">Status</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="td">
                  <form id={`u-${u.id}`} action={updateUser}>
                    <input type="hidden" name="id" value={u.id} />
                  </form>
                  <p className="font-medium">{u.full_name || "—"}</p>
                  <p className="text-xs text-zinc-500">{u.email}</p>
                </td>
                <td className="td">
                  <select form={`u-${u.id}`} name="role" defaultValue={u.role} className="input w-44">
                    {roleOptions}
                  </select>
                </td>
                <td className="td">
                  <select
                    form={`u-${u.id}`}
                    name="department_id"
                    defaultValue={u.department_id ?? ""}
                    className="input w-36"
                  >
                    <option value="">— none —</option>
                    {deptOptions}
                  </select>
                </td>
                <td className="td">
                  <select
                    form={`u-${u.id}`}
                    name="is_active"
                    defaultValue={String(u.is_active)}
                    className="input w-28"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </td>
                <td className="td">
                  <button form={`u-${u.id}`} className="btn-ghost">Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createUser} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <p className="text-sm font-medium sm:col-span-2 lg:col-span-3">Create a user</p>
        <input name="full_name" required placeholder="Full name" className="input" />
        <input name="email" type="email" required placeholder="Email" className="input" />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Temporary password (min 8)"
          className="input"
        />
        <select name="role" defaultValue="dept_user" className="input">{roleOptions}</select>
        <select name="department_id" className="input">
          <option value="">— no department —</option>
          {deptOptions}
        </select>
        <button className="btn-primary">Create user</button>
      </form>
    </div>
  );
}
