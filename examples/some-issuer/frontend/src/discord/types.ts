import { CommonConfig, Platform } from '../shared/types';

export interface DiscordConfig extends CommonConfig {
  type: Platform.Discord;
  discordClientId: string;
}
