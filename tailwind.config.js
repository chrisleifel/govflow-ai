/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/**/*.{html,js}",
  ],
  theme: {
    extend: {
      colors: {
        'ocean-dark': '#0A1628',
        'ocean-blue': '#0F172A',
        'ocean-light': '#1E293B',
        'cyan-bright': '#06B6D4',
        'blue-bright': '#3B82F6',
      },
    },
  },
  plugins: [],
}
