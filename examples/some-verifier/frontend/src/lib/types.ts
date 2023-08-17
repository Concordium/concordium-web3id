export interface Config {
  discordClientId: string;
  issuers: Record<Platform, Issuer>;
}

export enum Platform {
  Telegram = 'telegram',
  Discord = 'discord',
}

export interface Issuer {
  url: string;
  chain: string;
  index: string;
  subindex: string;
}
