import { createBrowserRouter, Navigate } from "react-router";
import { useAuth } from "./context/AuthContext";
import { RouteError } from "./components/ErrorBoundary";
import { AuthPage } from "./pages/AuthPage";
import { OnboardingPage } from "./pages/onboarding/OnboardingPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";

/** "/" sends each user to where the server says they are in the journey. */
function Home() {
  const { status, user } = useAuth();
  if (status === "signed_out") return <Navigate to="/welcome" replace />;
  if (!user) return null;                         // locked — AppLock overlays
  const ob = user.onboarding;
  return <Navigate to={ob.complete ? "/dashboard" : `/onboarding/${ob.next_step}`} replace />;
}

export const router = createBrowserRouter([
  { path: "/", Component: Home, errorElement: <RouteError /> },
  { path: "/welcome", Component: AuthPage, errorElement: <RouteError /> },
  { path: "/onboarding", element: <Navigate to="/" replace /> },
  { path: "/onboarding/:step", Component: OnboardingPage, errorElement: <RouteError /> },
  { path: "/dashboard", Component: DashboardPage, errorElement: <RouteError /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
