import { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { useAuth } from "../features/auth/useAuth";
import { getNavigationItems } from "../features/auth/navigation";

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);

  const title = useMemo(() => {
    const items = user ? getNavigationItems(user.role) : [];
    return (
      items.find((item) => item.path === location.pathname)?.label ?? "Workspace"
    );
  }, [location.pathname, user]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <Sidebar
        onClose={() => setNavigationOpen(false)}
        open={navigationOpen}
        role={user.role}
      />
      <div className="min-h-screen lg:pl-72">
        <Header
          onMenuClick={() => setNavigationOpen(true)}
          title={title}
        />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
