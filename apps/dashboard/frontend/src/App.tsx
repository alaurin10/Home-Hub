import { AnimatePresence } from "framer-motion";
import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { FleetBanner } from "./components/FleetBanner";
import { Rail } from "./components/Rail";
import { SettingsDialog } from "./components/SettingsDialog";
import { TabBar } from "./components/TabBar";
import { useStore } from "./store";
import { HomeView } from "./views/HomeView";

// Code-split the detail views: they pull in Recharts (~half the bundle), which
// the Home grid's sparklines never need. First paint ships without it.
const RoomView = lazy(() => import("./views/RoomView").then((m) => ({ default: m.RoomView })));
const SystemView = lazy(() => import("./views/SystemView").then((m) => ({ default: m.SystemView })));
const CompareView = lazy(() =>
  import("./views/CompareView").then((m) => ({ default: m.CompareView })),
);

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
    // One responsive app, not two builds: below lg the document scrolls
    // normally (a fixed 100vh shell fights mobile browsers' collapsing
    // toolbars); at and above lg the rail becomes persistent and the main
    // column scrolls independently beside it.
    <div className="min-h-screen lg:flex lg:h-screen lg:min-h-0">
      <div className="hidden lg:flex">
        <Rail />
      </div>
      <div className="lg:min-w-0 lg:flex-1 lg:overflow-auto">
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
              path="/compare"
              element={
                <Suspense fallback={null}>
                  <CompareView />
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
      </div>
      <TabBar />
      <SettingsDialog />
    </div>
  );
}

/** Shared page frame: the padding and block rhythm every view uses. */
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-col gap-5 p-[30px_40px_56px] max-lg:gap-3.5 max-lg:p-[14px_18px_108px]">
      {children}
    </main>
  );
}
