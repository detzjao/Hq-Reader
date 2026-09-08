/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 35px rgba(220, 38, 38, 0.16)'
      }
    }
  },
  plugins: []
};
