import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './telegram/App.tsx'
import './scss/index.scss'

if (config.type !== 'telegram') {
  throw new Error('Expected telegram config');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
