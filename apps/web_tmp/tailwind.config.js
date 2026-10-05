/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0D1318',
        surface: '#161D24',
        border: '#283945',
        primary: '#4FF8D2',
        'primary-hover': '#88FFE4',
        text: {
          main: '#FFFFFF',
          muted: 'rgba(255, 255, 255, 0.5)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
