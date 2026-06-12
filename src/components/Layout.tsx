import { Outlet } from "react-router-dom";
import { Header } from "./Header";

export function Layout() {
  return (
    <div className="app-shell min-h-screen overflow-hidden bg-surface">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1660px] flex-col px-4 pb-10 pt-4 sm:px-5 lg:px-7">
        <Header />
        <main className="relative flex-1 pt-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
