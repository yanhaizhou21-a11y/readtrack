import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const isReader = location.pathname.startsWith("/read/");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <main className={`flex-1 flex flex-col max-w-md mx-auto w-full ${!isReader ? "pb-20" : ""}`}>
        <Outlet />
      </main>
      {!isReader && <BottomNav />}
    </div>
  );
};
