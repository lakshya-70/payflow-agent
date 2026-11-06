import type { Config } from "tailwindcss";

/**
 * PayFlow design tokens — dark, futuristic, "agentic".
 * Tasky dark UI with cyan/violet neon accents (PayPal-adjacent blue).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "flow-bg": "#05070f",
        "flow-panel": "#0b1020",
        "flow-line": "rgba(148, 163, 184, 0.14)",
        "flow-cyan": "#22d3ee",
        "flow-violet": "#a78bfa",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 32px rgba(34, 211, 238, 0.16)",
        "neon-violet": "0 0 36px rgba(167, 139, 250, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
