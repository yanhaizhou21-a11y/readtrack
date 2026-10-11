import React from "react";
import { NavLink } from "react-router-dom";
import { Home, BookOpen, Activity, Settings } from "lucide-react";
import { useTranslation, type TranslationKey } from "@/i18n";

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/library", labelKey: "nav.library", icon: BookOpen },
  { to: "/tracker", labelKey: "nav.tracker", icon: Activity },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

export const BottomNav: React.FC = () => {
  const { t } = useTranslation();

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Main Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t-2 border-border pb-safe transition-all"
    >
      <div className="flex items-stretch justify-around h-14 max-w-md mx-auto">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isLast = index === NAV_ITEMS.length - 1;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-w-[44px] min-h-[44px] transition-colors ${
                  !isLast ? "border-r border-border" : ""
                } ${
                  isActive
                    ? "bg-neutral-100 dark:bg-neutral-800 text-accent font-bold"
                    : "text-muted hover:text-foreground hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? "stroke-[2.2] text-accent" : "stroke-[1.5]"
                    }`}
                  />
                  <span className="text-[10px] font-mono uppercase tracking-widest mt-1 leading-none">
                    {t(item.labelKey)}
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
