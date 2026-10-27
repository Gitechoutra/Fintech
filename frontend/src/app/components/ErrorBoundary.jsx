import { Component } from "react";
import { useRouteError } from "react-router";
import { AlertTriangle } from "lucide-react";

function Fallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-page">
      <div className="max-w-sm text-center">
        <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-3" aria-hidden />
        <h1 className="text-lg font-bold text-fg">Something went wrong</h1>
        <p className="text-sm text-muted mt-1">Please reload the page. Your account and payments are not affected.</p>
        <button onClick={() => window.location.assign("/")}
          className="mt-5 h-11 px-5 rounded-[var(--radius-control)] bg-mint-600 text-on-primary font-semibold">Reload</button>
      </div>
    </div>
  );
}

/** Route-level error element (react-router). Never shows stack traces. */
export function RouteError() {
  const err = useRouteError();
  if (import.meta.env.DEV) console.error(err);
  return <Fallback />;
}

export class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { if (import.meta.env.DEV) console.error(error); }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}
