import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './discord/App.tsx'
import './scss/index.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
