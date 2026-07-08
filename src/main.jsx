import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './logo-polish.css'
import { applyLogoPolish } from './logo-polish.js'

createRoot(document.getElementById('root')).render(<App />)
applyLogoPolish()
