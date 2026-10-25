import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { SessionProvider } from "./lib/api";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { ShareJoin } from "./pages/ShareJoin";
import { RequireAuth } from "./components/RequireAuth";

const TripPage = lazy(() => import("./pages/Trip").then((m) => ({ default: m.TripPage })));

const router = createBrowserRouter(
  [
    { path: "/", element: <RequireAuth><Home /></RequireAuth> },
    { path: "/login", element: <Login /> },
    { path: "/s/:token", element: <ShareJoin /> },
    // Trip page handles its own gate: shared trips open without a login
    { path: "/trip/:id", element: <Suspense fallback={null}><TripPage /></Suspense> },
  ],
  { basename: "/travelplanner" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
