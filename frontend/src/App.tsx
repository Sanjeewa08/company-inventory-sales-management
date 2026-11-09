import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ModulePlaceholderPage } from "./pages/ModulePlaceholderPage";

function ApplicationRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path=":section" element={<ModulePlaceholderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ApplicationRoutes />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
