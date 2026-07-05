import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App.tsx'

// Cached data is served instantly on tab switches; refetch happens in the
// background past staleTime. Mutations still invalidate immediately.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, gcTime: 30 * 60_000 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
