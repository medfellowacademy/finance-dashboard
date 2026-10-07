import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "finance" | "dept_head" | "dept_user" | "viewer";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  department_name: string | null;
  is_active: boolean;
};

export const isStaff = (p: Pick<Profile, "role">) => p.role === "owner" || p.role === "finance";
export const canSeeAll = (p: Pick<Profile, "role">) => isStaff(p) || p.role === "viewer";
export const canWrite = (p: Pick<Profile, "role">) => p.role !== "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  finance: "Finance",
  dept_head: "Department head",
  dept_user: "Department user",
  viewer: "Viewer / CA",
};

/** Current signed-in profile. Redirects to /login if signed out. */
export async function getProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, department_id, is_active, departments(name)")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/login");
  const { departments, ...rest } = data as typeof data & { departments: { name: string } | null };
  return { ...rest, department_name: departments?.name ?? null } as Profile;
}

/** Guard for pages and actions; redirects home if the role isn't allowed. */
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile.is_active || !roles.includes(profile.role)) redirect("/");
  return profile;
}
