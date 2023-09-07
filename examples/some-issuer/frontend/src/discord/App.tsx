import discordLogo from 'assets/discord-logo-color.svg';
import Main from "../shared/Main"

function App() {

  return (
    <Main platform="Discord" logo={<img src={discordLogo} alt="Discord logo" />}>
    </Main>
  )
}

export default App
