import { Platform, Issuer } from '../lib/types';

declare global {
  declare const config: {
    discordClientId: string;
    telegramBotName: string;
    issuers: Record<Platform, Issuer>;
  };
}
