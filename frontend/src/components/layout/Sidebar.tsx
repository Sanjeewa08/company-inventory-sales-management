import { NavLink } from "react-router-dom";
import type { UserRole } from "../../types/auth";
import { getNavigationItems } from "../../features/auth/navigation";
import type { NavigationItem } from "../../features/auth/navigation";

interface SidebarProps {
  role: UserRole;
  open: boolean;
  onClose: () => void;
}

function NavigationGroups({
  items,
  onNavigate,
}: {
  items: NavigationItem[];
  onNavigate: () => void;
}) {
  const groups = [...new Set(items.map((item) => item.group))];
  return (
    <nav aria-label="Main navigation" className="space-y-6">
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {group}
          </p>
          <div className="space-y-1">
            {items
              .filter((item) => item.group === group)
              .map((item) => (
                <NavLink
                  end={item.path === "/"}
                  key={item.path}
                  onClick={onNavigate}
                  to={item.path}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/20"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-[10px] font-bold tracking-wide text-current group-hover:bg-white/10"
                  >
                    {item.initials}
                  </span>
                  {item.label}
                </NavLink>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const items = getNavigationItems(role);
  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={onClose}
          type="button"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[#111a35] px-4 py-5 text-white transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-sky-400 text-sm font-black text-[#111a35] shadow-lg shadow-indigo-950/30">
            MI
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">Meridian</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Inventory &amp; sales
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Workspace
          </p>
          <p className="mt-1 text-xs font-medium capitalize text-slate-200">
            {role.toLowerCase()} access
          </p>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <NavigationGroups items={items} onNavigate={onClose} />
        </div>
        <p className="px-3 pt-5 text-[11px] text-slate-500">
          Company operations workspace
        </p>
      </aside>
    </>
  );
}
