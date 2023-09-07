export enum Platform {
  Telegram = 'telegram',
  Discord = 'discord',
}

export interface CommonConfig {
  network: string;
  contract: { index: string; subindex: string; }
}

export type NotOptional<T> = {
  [P in keyof T]-?: T[P];
};
export type MakeRequired<T, K extends keyof T> = NotOptional<Pick<T, K>> & Omit<T, K>;
