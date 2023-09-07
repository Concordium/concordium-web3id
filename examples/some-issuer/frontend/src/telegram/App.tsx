import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';
import telegramLogo from 'assets/telegram-logo-color.svg';
import Main from "../shared/Main"
import { TelegramConfig } from './types';
import { Platform } from '../shared/types';
import { requestCredential } from '../shared/util';

const { telegramBotName } = config as TelegramConfig;

function App() {
  const onTelegramAuth = async ({ username, ...user }: TelegramUser) => {
    try {
      if (!username) {
        throw new Error(
          'A telegram username must be available to create a credential.',
        );
      }

      await requestCredential({
        platform: Platform.Telegram,
        user: { username, ...user },
      });
    } catch (error) {
      alert(`An error occured: ${(error as Error).message ?? error}`);
      return;
    }
  };

  return (
    <Main platform="Telegram" logo={<img src={telegramLogo} alt="Telegram logo" />}>
      <TelegramLoginButton
        botName={telegramBotName}
        dataOnauth={onTelegramAuth}
        cornerRadius={3}
      />
    </Main>
  )
}

export default App
