import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { Home } from "./pages/Home";
const TripPage = lazy(() => import("./pages/Trip").then((m) => ({ default: m.TripPage })));

const router = createBrowserRouter(
  [
    { path: "/", element: <Home /> },
    { path: "/trip/:id", element: <Suspense fallback={null}><TripPage /></Suspense> },
  ],
  { basename: "/travelplanner" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
