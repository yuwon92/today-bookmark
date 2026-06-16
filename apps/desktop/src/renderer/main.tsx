import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { WidgetView } from './components/WidgetView'
import './index.css'

const isWidget = new URLSearchParams(window.location.search).get('mode') === 'widget'
if (isWidget) document.body.classList.add('widget-mode')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isWidget ? <WidgetView /> : <App />}
  </React.StrictMode>
)
