import { useState } from "react"
import Layout from "../shared/Layout"

function App() {
  const [count, setCount] = useState(0)

  return (
    <Layout title="Telegram">
      <button onClick={() => setCount((count) => count + 1)}>
        count is {count}
      </button>
    </Layout>
  )
}

export default App
