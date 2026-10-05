import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  actions,
}) => {
  const navigate = useNavigate();

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-30 bg-background/95 backdrop-blur-xs pt-safe border-b-2 border-border"
    >
      <div className="flex items-center justify-between px-4 h-14 max-w-md mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="w-10 h-10 -ml-2 flex items-center justify-center text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2]" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-serif font-black text-foreground truncate leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
};
