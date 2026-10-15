/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#050a0e",
          card: "rgba(13, 26, 31, 0.72)",
          mint: "#4ee7a6",
          cyan: "#38ef7d",
          teal: "#2dd4bf",
          border: "rgba(45, 212, 191, 0.22)",
        },
      },
      fontFamily: {
        tech: ["'Plus Jakarta Sans'", "'Inter'", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["'Plus Jakarta Sans'", "'Inter'", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["dark"],
    darkTheme: "dark",
  },
};
