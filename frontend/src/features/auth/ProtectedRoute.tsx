import { Navigate, Outlet } from "react-router-dom";
import type { UserRole } from "../../types/auth";
import { Loading } from "../../components/ui/Loading";
import { useAuth } from "./useAuth";

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return <Loading fullScreen label="Checking your session" />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
