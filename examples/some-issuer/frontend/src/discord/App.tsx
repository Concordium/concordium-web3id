import discordLogo from 'assets/discord-logo-color.svg';
import Layout from "../shared/Layout"

function App() {

  return (
    <Layout platform="Discord" logo={<img src={discordLogo} alt="Discord logo" />}>
    </Layout>
  )
}

export default App
