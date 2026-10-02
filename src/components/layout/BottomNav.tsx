import React from "react";
import { NavLink } from "react-router-dom";
import { Home, BookOpen, Activity, Settings } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/tracker", label: "Tracker", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const BottomNav: React.FC = () => {
  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Main Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border pb-safe transition-all"
    >
      <div className="flex items-center justify-around h-14 max-w-md mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] transition-colors ${
                  isActive
                    ? "text-accent font-medium"
                    : "text-muted hover:text-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 transition-transform ${
                      isActive ? "scale-105" : ""
                    }`}
                  />
                  <span className="text-[11px] mt-1 leading-tight tracking-tight">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
