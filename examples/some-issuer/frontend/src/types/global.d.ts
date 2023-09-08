import { DiscordConfig } from '../discord/types';
import { TelegramConfig } from '../telegram/types';

export type Config = DiscordConfig | TelegramConfig;

declare global {
    declare const config: Config;
}
