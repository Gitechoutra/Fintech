import { createBrowserRouter, Navigate } from "react-router";
import { useAuth } from "./context/AuthContext";
import { RouteError } from "./components/ErrorBoundary";
import { AuthPage } from "./pages/AuthPage";
import { OnboardingPage } from "./pages/onboarding/OnboardingPage";
import { AppShell } from "./pages/app/AppShell";
import { HomePage } from "./pages/app/HomePage";
import { SearchPage } from "./pages/app/SearchPage";
import { CardsPage } from "./pages/app/CardsPage";
import { BillsPage } from "./pages/app/BillsPage";
import { EmisPage } from "./pages/app/EmisPage";
import { LoanDetailPage, LoansPage } from "./pages/app/LoansPage";
import { HistoryPage } from "./pages/app/HistoryPage";
import { SettingsPage } from "./pages/app/SettingsPage";

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
  {
    path: "/dashboard",
    Component: AppShell,
    errorElement: <RouteError />,
    children: [
      { index: true, Component: HomePage },
      { path: "search", Component: SearchPage },
      { path: "payments", element: <Navigate to="/dashboard" replace /> },
      { path: "cards", Component: CardsPage },
      // The QR decoder is heavy: load the Scanner only when it is opened.
      { path: "scanner", lazy: () => import("./pages/app/ScannerPage").then((m) => ({ Component: m.ScannerPage })) },
      { path: "bills", Component: BillsPage },
      { path: "emis", Component: EmisPage },
      { path: "loans", Component: LoansPage },
      { path: "loans/:loanId", Component: LoanDetailPage },
      { path: "history", Component: HistoryPage },
      { path: "settings", Component: SettingsPage },
      { path: "profile", element: <Navigate to="/dashboard/settings" replace /> },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
