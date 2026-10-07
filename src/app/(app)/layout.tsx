import Link from "next/link";
import { getProfile, isStaff, canSeeAll, ROLE_LABEL } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

type NavLink = { href: string; label: string; show: boolean };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getProfile();
  const staff = isStaff(me);
  const active = me.is_active;
  const sales = me.department_name === "Sales";

  const groups: { title?: string; links: NavLink[] }[] = [
    {
      links: [
        { href: "/", label: "Dashboard", show: true },
        { href: "/money-in", label: "Money In", show: active },
        { href: "/students", label: "Students & fees", show: active && (canSeeAll(me) || sales) },
        { href: "/invoices", label: "GST invoices", show: active && (canSeeAll(me) || sales) },
        { href: "/money-out", label: "Money Out", show: active },
        { href: "/parties", label: "Vendors & staff", show: active },
      ],
    },
    {
      title: "Control",
      links: [
        { href: "/reports", label: "Reports", show: active },
        { href: "/budgets", label: "Budgets", show: active && (canSeeAll(me) || me.role === "dept_head") },
        { href: "/reconcile", label: "Reconciliation", show: staff },
        { href: "/import", label: "Import from Excel", show: staff },
        { href: "/audit", label: "Audit log", show: me.role === "owner" },
      ],
    },
    {
      title: "Settings",
      links: [
        { href: "/settings/company", label: "Company & GST", show: staff },
        { href: "/settings/departments", label: "Departments", show: staff },
        { href: "/settings/categories", label: "Categories", show: staff },
        { href: "/settings/accounts", label: "Accounts", show: staff },
        { href: "/settings/users", label: "Users", show: me.role === "owner" },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-zinc-200 bg-white print:hidden md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <p className="text-base font-semibold text-teal-800">Medfellow Finance</p>
          <p className="text-xs text-zinc-500">Academy payments & accounts</p>
        </div>
        <nav className="flex gap-3 overflow-x-auto px-2 pb-2 md:flex-col md:gap-4 md:pb-0">
          {groups.map((g, gi) => {
            const links = g.links.filter((l) => l.show);
            if (links.length === 0) return null;
            return (
              <div key={gi} className="flex gap-1 md:flex-col">
                {g.title && <p className="hidden px-3 pt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:block">{g.title}</p>}
                {links.map((l) => (
                  <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100">
                    {l.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="px-4 py-4 text-xs text-zinc-500">
          <p className="font-medium text-zinc-700">{me.full_name || me.email}</p>
          <p>{ROLE_LABEL[me.role]}{me.department_name ? ` · ${me.department_name}` : ""}</p>
          <form action={signOut} className="mt-2"><button className="underline">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
