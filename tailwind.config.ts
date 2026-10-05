import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: {
          DEFAULT: "var(--border)",
          muted: "var(--border-muted)",
        },
        divider: "var(--divider)",
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
        },
        warning: {
          DEFAULT: "var(--warning)",
        },
        danger: {
          DEFAULT: "var(--danger)",
        },
        neutral: {
          100: "#F5F5F5",
          200: "#E5E5E5",
          400: "#A3A3A3",
          500: "#737373",
          600: "#525252",
          700: "#404040",
        },
        // Reading theme tokens
        reading: {
          paper: {
            bg: "#F9F9F7",
            text: "#111111",
            link: "#CC0000",
          },
          sepia: {
            bg: "#F2E8D5",
            text: "#3B3024",
            link: "#8B2500",
          },
          dark: {
            bg: "#111111",
            text: "#F9F9F7",
            link: "#E53935",
          },
        },
        // Editorial highlight tokens
        highlight: {
          yellow: "#FFE066",
          green: "#B2E2B8",
          blue: "#A7D2FA",
          pink: "#FFB3C6",
          orange: "#FFCCA8",
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", "'Times New Roman'", "Georgia", "serif"],
        body: ["'Lora'", "Georgia", "serif"],
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Courier New'", "monospace"],
      },
      borderRadius: {
        none: "0px",
        control: "0px",
        card: "0px",
        container: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        full: "0px",
      },
      boxShadow: {
        hard: "4px 4px 0px 0px var(--border)",
        "hard-sm": "2px 2px 0px 0px var(--border)",
      },
      spacing: {
        18: "4.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
