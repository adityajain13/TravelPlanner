import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ConfirmHost } from "./components/ConfirmDialog";
import "./index.css";
import { SessionProvider } from "./lib/api";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { ShareJoin } from "./pages/ShareJoin";
import { RequireAuth } from "./components/RequireAuth";
import { RouteError, reloadOnce } from "./components/RouteError";

// A chunk from the previous deploy failed to load (e.g. the map): fetch the new build
window.addEventListener("vite:preloadError", (e) => {
  if (reloadOnce()) e.preventDefault();
});

const tripChunk = () => import("./pages/Trip");
const TripPage = lazy(() => tripChunk().then((m) => ({ default: m.TripPage })));
// Opening a trip straight from a link/reload: fetch its page chunk alongside the app shell
if (/\/trip\//.test(location.pathname)) void tripChunk();

const router = createBrowserRouter(
  [
    { path: "/", element: <RequireAuth><Home /></RequireAuth>, errorElement: <RouteError /> },
    { path: "/login", element: <Login />, errorElement: <RouteError /> },
    { path: "/s/:token", element: <ShareJoin />, errorElement: <RouteError /> },
    // Trip page handles its own gate: shared trips open without a login
    { path: "/trip/:id", element: <Suspense fallback={null}><TripPage /></Suspense>, errorElement: <RouteError /> },
  ],
  { basename: "/travelplanner" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
      <ConfirmHost />
    </SessionProvider>
  </StrictMode>,
);
