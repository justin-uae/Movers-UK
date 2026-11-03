import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
        sidebar: "#192233",
        appbg: "#f6f7fb",
      },
      boxShadow: {
        panel: "0 1px 2px 0 rgb(15 23 42 / 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
