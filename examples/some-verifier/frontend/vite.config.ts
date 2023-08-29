import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Oauth and Telegram auth will not work if not served on 127.0.0.1 for local dev
    port: 80,
    strictPort: true,
  },
});
