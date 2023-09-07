import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { Config } from './src/types/global';
import { Platform } from './src/shared/types';
import { TelegramConfig } from './src/telegram/types';
import { DiscordConfig } from './src/discord/types';

interface PlatformConfig {
  port: number;
  config: Config;
}

interface HtmlPlaceholders {
  config: Config;
}

const SUPPORTED_PLATFORMS = [Platform.Discord, Platform.Telegram];
const DEFAULT_NETWORK = 'testnet';

const platform: Platform = process.env.VITE_SOME_ISSUER_PLATFORM as Platform;

if (!SUPPORTED_PLATFORMS.includes(platform)) {
  throw new Error(`Please specify environment variable "VITE_SOME_ISSUER_PLATFORM" to be one of: ${SUPPORTED_PLATFORMS.join(',')}`)
}

const parseContractAddress = (address: string) => {
  const [index, subindex] = address.replace(/[<>]/g, '').split(',');
  return { index, subindex };
}

const telegramConfig: TelegramConfig = {
  type: Platform.Telegram,
  network: process.env.TELEGRAM_ISSUER_NETWORK ?? DEFAULT_NETWORK,
  telegramBotName: process.env.TELEGRAM_BOT_NAME,
  contract: parseContractAddress(process.env.TELEGRAM_ISSUER_REGISTRY_ADDRESS)
};

const discordConfig: DiscordConfig = {
  type: Platform.Discord,
  network: process.env.DISCORD_ISSUER_NETWORK ?? DEFAULT_NETWORK,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  contract: parseContractAddress(process.env.DISCORD_ISSUER_REGISTRY_ADDRESS)
};

const configs: { [p in Platform]: PlatformConfig } = {
  [Platform.Telegram]: {
    port: 8080,
    config: telegramConfig,
  },
  [Platform.Discord]: {
    port: 8081,
    config: discordConfig,
  },
}

const { port, config } = configs[platform];

const transformHtml: (data: HtmlPlaceholders) => Plugin = data => ({
  name: 'transform-html',
  transformIndexHtml: {
    enforce: 'pre',
    handler(html, ctx) {
      if (!ctx.server) {
        // We're building for production. Let production server do placeholder replacements
        return html;
      }

      return html.replace(
        /{{(\w+)}}/gi,
        (_, placeholder) => {
          const d = data[placeholder];
          if (d === undefined) {
            throw new Error(`No data supplied for placeholder: ${placeholder}`);
          }
          return JSON.stringify(d);
        }
      );
    }
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    transformHtml({ config }),
  ],
  esbuild: false,
  build: {
    outDir: `./dist/${platform}`
  },
  server: {
    port,
    strictPort: true,
  },
})
