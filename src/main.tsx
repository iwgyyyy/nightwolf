import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { preloadNarration } from '@/services/NarrationService'

// 进入应用即预加载全部播报录音，夜晚播报零网络延迟
preloadNarration()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
