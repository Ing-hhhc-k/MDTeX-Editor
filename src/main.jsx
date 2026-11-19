import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'katex/dist/katex.min.css'
import './style.css'
import './view.css'
import './workspace.css'
createRoot(document.getElementById('root')).render(<App />)
