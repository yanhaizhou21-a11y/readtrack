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
        },
        border: "var(--border)",
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
        // Reading theme tokens
        reading: {
          paper: {
            bg: "#FBF9F4",
            text: "#26231F",
            link: "#2B5F55",
          },
          sepia: {
            bg: "#F2E8D5",
            text: "#3B3024",
            link: "#7A4B1E",
          },
          dark: {
            bg: "#1A1917",
            text: "#CFC9BE",
            link: "#7FB5A6",
          },
        },
        // Highlight tokens
        highlight: {
          yellow: "#F6D860",
          green: "#A9D8A0",
          blue: "#A5C8E8",
          pink: "#F0B0C8",
          orange: "#F4BE8A",
        },
      },
      fontFamily: {
        serif: ["Newsreader", "Source Serif 4", "Georgia", "serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
        full: "9999px",
      },
      spacing: {
        18: "4.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
