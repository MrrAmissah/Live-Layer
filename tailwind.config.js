export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obs: {
          surface: '#121212',
          surface2: '#1d1d1d',
          border: '#2f2f2f',
          text: '#f7f7f7',
          muted: '#9ca3af'
        }
      },
      boxShadow: {
        soft: '0 20px 40px rgba(0, 0, 0, 0.18)'
      }
    }
  },
  plugins: []
};
