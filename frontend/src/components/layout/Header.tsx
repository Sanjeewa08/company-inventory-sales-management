import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { useAuth } from "../../features/auth/useAuth";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md sm:px-7 lg:px-10">
      <div className="flex items-center gap-3">
        <button
          aria-label="Open navigation"
          className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 lg:hidden"
          onClick={onMenuClick}
          type="button"
        >
          <span aria-hidden="true" className="text-lg">
            ☰
          </span>
        </button>
        <div>
          <p className="text-xs font-medium text-slate-400">Workspace</p>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
          <p className="text-xs text-slate-500">{user?.role}</p>
        </div>
        <div
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700"
        >
          {user?.name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <Button
          aria-label="Sign out"
          className="px-3 sm:px-4"
          onClick={handleLogout}
          variant="ghost"
        >
          <span className="hidden sm:inline">Sign out</span>
          <span aria-hidden="true" className="sm:hidden">
            ↗
          </span>
        </Button>
      </div>
    </header>
  );
}
