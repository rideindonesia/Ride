import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContext, useAdminState } from "@/hooks/useAdmin";
import { Layout } from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Mitra from "@/pages/Mitra";
import Pengguna from "@/pages/Pengguna";
import Orders from "@/pages/Orders";
import Keuangan from "@/pages/Keuangan";
import Voucher from "@/pages/Voucher";
import Laporan from "@/pages/Laporan";
import Tiket from "@/pages/Tiket";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminState();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin w-8 h-8 border-2 border-[#1a7a6a] border-t-transparent rounded-full" />
    </div>
  );
  if (!admin) return <Redirect to="/login" />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const adminState = useAdminState();
  return (
    <AdminContext.Provider value={adminState}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" component={() => <AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/mitra" component={() => <AuthGuard><Mitra /></AuthGuard>} />
        <Route path="/pengguna" component={() => <AuthGuard><Pengguna /></AuthGuard>} />
        <Route path="/orders" component={() => <AuthGuard><Orders /></AuthGuard>} />
        <Route path="/keuangan" component={() => <AuthGuard><Keuangan /></AuthGuard>} />
        <Route path="/voucher" component={() => <AuthGuard><Voucher /></AuthGuard>} />
        <Route path="/laporan" component={() => <AuthGuard><Laporan /></AuthGuard>} />
        <Route path="/tiket" component={() => <AuthGuard><Tiket /></AuthGuard>} />
        <Route path="/settings" component={() => <AuthGuard><Settings /></AuthGuard>} />
      </Switch>
    </AdminContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppRoutes />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
