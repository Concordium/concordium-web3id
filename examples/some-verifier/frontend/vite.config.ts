import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { Platform, Issuer } from './src/lib/types';

const config = {
  discordClientId: process.env.DISCORD_CLIENT_ID,
  telegramBotName: process.env.TELEGRAM_BOT_NAME,
  network: process.env.TELEGRAM_ISSUER_NETWORK ?? 'testnet',
  issuers: {
    [Platform.Telegram]: {
      url: process.env.TELEGRAM_ISSUER_URL ?? '127.0.0.1:8080',
      index: process.env.TELEGRAM_ISSUER_INDEX ?? '0',
      subindex: '0',
    } as Issuer,
    [Platform.Discord]: {
      url: process.env.TELEGRAM_ISSUER_URL ?? '127.0.0.1:8081',
      index: process.env.TELEGRAM_ISSUER_INDEX ?? '0',
      subindex: '0',
    } as Issuer,
  },
};

console.log(JSON.stringify(config));
const transformHtml: (data: any) => Plugin = (data) => ({
  name: 'transform-html',
  transformIndexHtml: {
    enforce: 'pre',
    handler(html, ctx) {
      if (!ctx.server) {
        // We're building for production. Let production server do placeholder replacements
        return html;
      }

      return html.replace(/{{(\w+)}}/gi, (_, placeholder: string) => {
        if (placeholder === 'config') {
          return JSON.stringify(data);
        } else {
          throw new Error(`Unrecognized placeholder: ${placeholder}`);
        }
      });
    },
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), transformHtml(config)],
  esbuild: false,
  build: {
    outDir: './dist/',
  },
  server: {
    // Oauth and Telegram auth will not work if not served on 127.0.0.1 for local dev
    port: 80,
    strictPort: true,
  },
});
