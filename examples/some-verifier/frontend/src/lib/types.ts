export enum Platform {
  Telegram = 'telegram',
  Discord = 'discord',
}

export interface Issuer {
  url: string;
  index: string;
  subindex: string;
}
