import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SplashScreen from "@/pages/SplashScreen";
import RoleSelect from "@/pages/RoleSelect";
import AuthForm from "@/pages/AuthForm";
import RegisterPengguna from "@/pages/RegisterPengguna";
import RegisterMitra from "@/pages/RegisterMitra";
import DashboardPengguna from "@/pages/DashboardPengguna";
import DashboardMitra from "@/pages/DashboardMitra";
import OrderBengkel from "@/pages/OrderBengkel";
import OrderElektronik from "@/pages/OrderElektronik";
import OrderCuci from "@/pages/OrderCuci";
import OrderBarber from "@/pages/OrderBarber";
import OrderInspeksi from "@/pages/OrderInspeksi";
import OrderTowing from "@/pages/OrderTowing";
import ReviewPage from "@/pages/ReviewPage";

const queryClient = new QueryClient();

function RegisterFormRouter() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const role = new URLSearchParams(search).get("role");
  if (role === "pengguna") return <RegisterPengguna />;
  if (role === "mitra") return <RegisterMitra />;
  return <AuthForm mode="register" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={SplashScreen} />
      <Route path="/login">
        <RoleSelect mode="login" />
      </Route>
      <Route path="/register">
        <RoleSelect mode="register" />
      </Route>
      <Route path="/login/form">
        <AuthForm mode="login" />
      </Route>
      <Route path="/register/form" component={RegisterFormRouter} />
      <Route path="/dashboard/pengguna" component={DashboardPengguna} />
      <Route path="/dashboard/mitra" component={DashboardMitra} />
      <Route path="/order/bengkel" component={OrderBengkel} />
      <Route path="/order/elektronik" component={OrderElektronik} />
      <Route path="/order/cuci" component={OrderCuci} />
      <Route path="/order/barber" component={OrderBarber} />
      <Route path="/order/inspeksi" component={OrderInspeksi} />
      <Route path="/order/towing" component={OrderTowing} />
      <Route path="/review/:orderId" component={ReviewPage} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
