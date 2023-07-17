declare module 'react-telegram-login' {
    export type TelegramUser = {
        id: number,
        first_name: string,
        last_name?: string,
        username?: string,
        photo_url?: string,
        auth_date: number,
        hash: string,
    }

    interface TelegramLoginButtonProps {
        botName: string,
        buttonSize?: string,
        cornerRadius?: number,
        requestAccess?: string,
        usePic?: boolean,
        dataAuthUrl?: string,
        lang?: string,
        dataOnauth?: (TelegramUser) => void,
    }

    export default function TelegramLoginButton(props: TelegramLoginButtonProps): JSX.Element;
}