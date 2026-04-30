import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AuthWrapper } from "@/components/AuthWrapper";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Prizes from "@/pages/Prizes";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUserDetail from "@/pages/AdminUserDetail";
import StaffVerify from "@/pages/StaffVerify";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/scan" component={Scan} />
      <Route path="/prizes" component={Prizes} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users/:userId" component={AdminUserDetail} />
      <Route path="/staff/verify/:userId" component={StaffVerify} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthWrapper>
            <Router />
          </AuthWrapper>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
