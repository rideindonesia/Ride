import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SplashScreen from "@/pages/SplashScreen";
import RoleSelect from "@/pages/RoleSelect";
import AuthForm from "@/pages/AuthForm";
import RegisterPengguna from "@/pages/RegisterPengguna";
import RegisterMitra from "@/pages/RegisterMitra";
import DashboardPengguna from "@/pages/DashboardPengguna";
import OrderBengkel from "@/pages/OrderBengkel";

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
      <Route path="/order/bengkel" component={OrderBengkel} />
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
