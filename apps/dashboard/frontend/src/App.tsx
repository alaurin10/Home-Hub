import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { FleetBanner } from "./components/FleetBanner";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { useStore } from "./store";
import { HomeView } from "./views/HomeView";
import { RoomView } from "./views/RoomView";
import { SystemView } from "./views/SystemView";

export default function App() {
  const { init, ready } = useStore();
  const location = useLocation();

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screenshot/test harness hook: flipped once the first snapshot rendered
  useEffect(() => {
    if (ready) document.documentElement.dataset.loaded = "1";
  }, [ready]);

  return (
    <div className="min-h-screen bg-page">
      <Header />
      <FleetBanner />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomeView />} />
          <Route path="/room/:id" element={<RoomView />} />
          <Route path="/system" element={<SystemView />} />
        </Routes>
      </AnimatePresence>
      <TabBar />
    </div>
  );
}
