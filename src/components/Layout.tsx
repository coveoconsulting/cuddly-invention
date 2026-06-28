import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Header } from "./Header";
import { MobileSidebar, Sidebar } from "./Sidebar";

export function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const pageKey = location.pathname.split("/").slice(0, 3).join("/") || "/";

  // After the drawer closes, the hamburger is physically disabled for a moment.
  // On touch screens a tap on a drawer item can emit a delayed synthetic click
  // that lands on the now-uncovered hamburger and reopens the menu; a disabled
  // button cannot receive ANY click (real or synthetic), so this kills it.
  const reopenGuard = useRef(false);
  const [menuLocked, setMenuLocked] = useState(false);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    reopenGuard.current = true;
    setMenuLocked(true);
    window.setTimeout(() => {
      reopenGuard.current = false;
      setMenuLocked(false);
    }, 600);
  }, []);

  const openMobileMenu = useCallback(() => {
    if (reopenGuard.current) return;
    setMobileMenuOpen(true);
  }, []);

  // Always close the mobile drawer after a navigation.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell min-h-screen overflow-hidden bg-surface">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1660px]">
        <Sidebar />
        <MobileSidebar open={mobileMenuOpen} onClose={closeMobileMenu} />
        <div className="flex min-w-0 flex-1 flex-col px-4 pb-safe sm:px-5 lg:px-7">
          <Header onOpenMobileMenu={openMobileMenu} menuDisabled={menuLocked} />
          <main className="relative flex-1 pt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pageKey}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
