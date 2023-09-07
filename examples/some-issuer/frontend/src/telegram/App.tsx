import telegramLogo from 'assets/telegram-logo-color.svg';
import Layout from "../shared/Layout"

function App() {
  return (
    <Layout platform="Telegram" logo={<img src={telegramLogo} alt="Telegram logo" />}>

    </Layout>
  )
}

export default App
