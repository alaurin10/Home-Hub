import { AnimatePresence } from "framer-motion";
import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { FleetBanner } from "./components/FleetBanner";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { useStore } from "./store";
import { HomeView } from "./views/HomeView";

// Code-split the detail views: RoomView pulls in Recharts (~half the bundle),
// which the Home grid never needs. First paint ships without it.
const RoomView = lazy(() => import("./views/RoomView").then((m) => ({ default: m.RoomView })));
const SystemView = lazy(() => import("./views/SystemView").then((m) => ({ default: m.SystemView })));

export default function App() {
  const { init, ready, initError } = useStore();
  const location = useLocation();

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screenshot/test harness hook: flipped once the first snapshot rendered
  useEffect(() => {
    if (ready) document.documentElement.dataset.loaded = "1";
  }, [ready]);

  if (initError && !ready)
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div role="alert" className="glass max-w-sm rounded-3xl p-8 text-center">
          <p className="text-sm font-semibold text-ink">Couldn't reach the dashboard server.</p>
          <p className="mt-2 text-xs text-muted">{initError}</p>
          <button
            onClick={() => void init()}
            className="glass-chrome mt-5 rounded-full px-4 py-1.5 text-sm font-medium text-ink-2"
          >
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen">
      <Header />
      <FleetBanner />
      {/* Suspense lives inside each route element (not as AnimatePresence's
          direct child) so the views' exit animations register with mode="wait". */}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomeView />} />
          <Route
            path="/room/:id"
            element={
              <Suspense fallback={null}>
                <RoomView />
              </Suspense>
            }
          />
          <Route
            path="/system"
            element={
              <Suspense fallback={null}>
                <SystemView />
              </Suspense>
            }
          />
        </Routes>
      </AnimatePresence>
      <TabBar />
    </div>
  );
}
