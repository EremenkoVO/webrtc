import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthService } from '@/api'
import type { RegisterRequest } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { useApiErrors } from '@/hooks/useApiErrors'
import { FontAwesomeIcon, faCheck, faEye, faEyeSlash, faLock, faSpinner, faUserOutline } from '@/icons'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const { errorMessages, hasErrors, parseApiError, clearErrors } = useApiErrors()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      parseApiError({ message: 'Пароли не совпадают' })
      return
    }
    setIsLoading(true)
    clearErrors()
    try {
      const body: RegisterRequest = { username, password }
      const response = await AuthService.registerUser(body)
      if (response && typeof response === 'object' && 'access_token' in response && 'refresh_token' in response) {
        const tokens = response as { access_token: string; refresh_token: string }
        if (tokens.access_token && tokens.refresh_token) {
          setTokens(tokens.access_token, tokens.refresh_token)
          navigate('/', { replace: true })
        }
      } else {
        parseApiError(response)
      }
    } catch (e) {
      parseApiError(e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-white text-center mb-8">WebRTC Client</h1>
          {hasErrors && (
            <div className="mb-4 p-4 bg-red-200 border border-red-400 text-red-700 rounded-lg">
              <ul>
                {errorMessages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <FontAwesomeIcon icon={faUserOutline} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Логин"
                className="w-full pl-10 pr-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div className="relative">
              <FontAwesomeIcon icon={faLock} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль"
                className="w-full pl-10 pr-12 py-3 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
              </button>
            </div>
            <div className="relative">
              <FontAwesomeIcon icon={faLock} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                className="w-full pl-10 pr-4 py-3 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white py-3 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FontAwesomeIcon icon={isLoading ? faSpinner : faCheck} spin={isLoading} />
              {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
            <p className="text-center">
              <Link to="/auth/login" className="text-indigo-400 hover:text-indigo-300">
                Войти
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
