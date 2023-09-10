import TelegramLoginButton, { TelegramUser } from 'react-telegram-login';
import { TelegramConfig } from './types';
import { Platform } from '../shared/types';
import { requestCredential } from '../shared/util';
import { useContext } from 'react';
import { appState } from 'shared/app-state';

const { telegramBotName } = config as TelegramConfig;

function App() {
  const { onTransactionFinalized, onTransactionSubmit } = useContext(appState);

  const onTelegramAuth = async ({ username, ...user }: TelegramUser) => {
    try {
      if (!username) {
        throw new Error(
          'A telegram username must be available to create a credential.',
        );
      }

      await requestCredential(
        {
          platform: Platform.Telegram,
          user: { username, ...user },
        },
        onTransactionSubmit,
        onTransactionFinalized,
      );
    } catch (error) {
      alert(`An error occured: ${(error as Error).message ?? error}`);
      return;
    }
  };

  return (
    <TelegramLoginButton
      botName={telegramBotName}
      dataOnauth={onTelegramAuth}
      cornerRadius={3}
      requestAccess={''}
    />
  );
}

export default App;
