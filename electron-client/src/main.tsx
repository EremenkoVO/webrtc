import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { OpenAPI } from '@/api'
import App from './App'
import './index.css'

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000'
OpenAPI.BASE = apiBase
const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
if (token) OpenAPI.TOKEN = token

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
