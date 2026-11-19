import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/app.css'
import './styles/mod-comercio.css'
import './styles/mod-perfil.css'
import './styles/mod-finanzas.css'
import './styles/mod-mensajes.css'
import './styles/mod-pos.css'
import './styles/mod-admin.css'
import './styles/mod-reparto.css'
import './styles/mod-catalogo.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/spa">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
