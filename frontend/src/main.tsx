import React from 'react'
import ReactDOM from 'react-dom/client'
// Initialize shared API client before any service imports — must be first
import './services/auth'
import App from './App.tsx'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)