import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { getNavigationItems } from "../features/auth/navigation";

export function ModulePlaceholderPage() {
  const { section } = useParams();
  const { user } = useAuth();
  if (!user || !section) return <Navigate to="/" replace />;

  const item = getNavigationItems(user.role).find(
    (navigationItem) => navigationItem.path === `/${section}`,
  );
  if (!item) return <Navigate to="/" replace />;

  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm shadow-slate-200/40 sm:p-10">
      <div className="grid size-12 place-items-center rounded-2xl bg-indigo-50 text-xs font-bold tracking-wide text-indigo-700">
        {item.initials}
      </div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
        Frontend foundation
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
        {item.label}
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
        This section is included in your role-based navigation. Its API-backed
        business interface will be added in a later Phase 8 increment.
      </p>
      <div className="mt-7 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
        <p className="text-sm font-medium text-slate-700">Workspace ready</p>
        <p className="mt-1 text-xs text-slate-500">
          No business data is loaded from this placeholder.
        </p>
      </div>
    </section>
  );
}
