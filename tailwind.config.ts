import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0c",
        panel: "#131318",
        line: "#232330",
        buyer: "#5b9dff",
        vendor: "#ff9d5b",
        breach: "#ff4d4f",
        ok: "#3ddc84",
      },
    },
  },
  plugins: [],
};

export default config;
