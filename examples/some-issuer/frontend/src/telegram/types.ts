import { CommonConfig, Platform } from '../shared/types';

export interface TelegramConfig extends CommonConfig {
  type: Platform.Telegram;
  telegramBotName: string;
}
