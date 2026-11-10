import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Loading } from "./components/ui/Loading";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import { ModulePlaceholderPage } from "./pages/ModulePlaceholderPage";

const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then(({ DashboardPage }) => ({
    default: DashboardPage,
  })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then(({ LoginPage }) => ({
    default: LoginPage,
  })),
);
const CategoriesPage = lazy(() =>
  import("./pages/CategoriesPage").then(({ CategoriesPage }) => ({
    default: CategoriesPage,
  })),
);
const ProductsPage = lazy(() =>
  import("./pages/ProductsPage").then(({ ProductsPage }) => ({
    default: ProductsPage,
  })),
);
const StockPage = lazy(() =>
  import("./pages/StockPage").then(({ StockPage }) => ({
    default: StockPage,
  })),
);
const SuppliersPage = lazy(() =>
  import("./pages/SuppliersPage").then(({ SuppliersPage }) => ({
    default: SuppliersPage,
  })),
);
const PurchaseOrdersPage = lazy(() =>
  import("./pages/PurchaseOrdersPage").then(({ PurchaseOrdersPage }) => ({
    default: PurchaseOrdersPage,
  })),
);
const CustomersPage = lazy(() =>
  import("./pages/CustomersPage").then(({ CustomersPage }) => ({
    default: CustomersPage,
  })),
);
const QuotationsPage = lazy(() =>
  import("./pages/QuotationsPage").then(({ QuotationsPage }) => ({
    default: QuotationsPage,
  })),
);
const InvoicesPage = lazy(() =>
  import("./pages/InvoicesPage").then(({ InvoicesPage }) => ({
    default: InvoicesPage,
  })),
);
const UsersPage = lazy(() =>
  import("./pages/UsersPage").then(({ UsersPage }) => ({
    default: UsersPage,
  })),
);

function ApplicationRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="quotations" element={<QuotationsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
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
        <Suspense fallback={<Loading fullScreen label="Loading workspace" />}>
          <ApplicationRoutes />
        </Suspense>
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
