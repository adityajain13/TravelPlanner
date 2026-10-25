import { Navigate } from "react-router-dom";
import { useSession } from "../lib/api";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === "loading") return null;
  if (status === "out") return <Navigate to="/login" replace />;
  return <>{children}</>;
}
