import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './discord/App'
import './scss/discord.scss'

if (config.type !== 'discord') {
  throw new Error('Expected discord config');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
