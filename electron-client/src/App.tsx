import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { OpenAPI } from '@/api'
import AuthPage from '@/pages/AuthPage'
import RegisterPage from '@/pages/RegisterPage'
import HomeView from '@/pages/HomeView'

function App() {
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (token) OpenAPI.TOKEN = token
    else OpenAPI.TOKEN = undefined
  }, [token])

  return (
    <Routes>
      <Route path="/auth/login" element={<AuthPage />} />
      <Route path="/auth/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomeView />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NavigateToLogin />} />
    </Routes>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const refreshToken = useAuthStore((s) => s.refreshToken)

  useEffect(() => {
    if (!token && !refreshToken) navigate('/auth/login', { replace: true })
  }, [token, refreshToken, navigate])

  if (!token && !refreshToken) return null
  return <>{children}</>
}

function NavigateToLogin() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/auth/login', { replace: true })
  }, [navigate])
  return null
}

export default App
