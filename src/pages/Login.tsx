import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'
import { asegurarUsuarioFirestore } from '../lib/signup'
import { Sprout, Mail, Lock, Loader2, UserPlus, LogIn, CheckCircle2, KeyRound, Phone } from 'lucide-react'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [isForgot, setIsForgot] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [celular, setCelular] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setSuccess('Te hemos enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.')
      setIsForgot(false)
    } catch (err) {
      console.error(err)
      const e = err as { code?: string }
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-email') {
        setError('No encontramos una cuenta con ese correo electrónico.')
      } else {
        setError('Error al enviar el correo de recuperación. Inténtalo de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (isRegister && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        await asegurarUsuarioFirestore(celular.trim() || undefined)
        await sendEmailVerification(userCredential.user)
        setSuccess('¡Cuenta creada! Por favor, verifica tu email para poder ingresar.')
        await signOut(auth)
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password)

        if (!userCredential.user.emailVerified) {
          setError('Tu cuenta aún no ha sido verificada. Revisa tu correo electrónico.')
          await signOut(auth)
          return
        }

        navigate('/')
      }
    } catch (err) {
      console.error(err)
      const e = err as { code?: string }
      if (isRegister) {
        if (e.code === 'auth/email-already-in-use') {
          setError('El email ya está en uso.')
        } else if (e.code === 'auth/weak-password') {
          setError('La contraseña es demasiado débil.')
        } else {
          setError('Error al crear la cuenta. Inténtalo de nuevo.')
        }
      } else {
        if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
          setError('Email o contraseña incorrectos.')
        } else {
          setError('Error al iniciar sesión. Inténtalo de nuevo.')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
      await asegurarUsuarioFirestore()
      navigate('/')
    } catch {
      setError('Error al iniciar sesión con Google.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: 'url("fondoLogin.png")', filter: 'blur(2px)' }}
        aria-hidden
      />
      <div className="absolute inset-0 z-0 bg-background/30 dark:bg-background/80" aria-hidden />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="bg-card/90 border border-border shadow-xl rounded-lg overflow-hidden backdrop-blur-md">
          <div className="p-8 pb-4 text-center">
            <div className="inline-flex p-2.5 rounded-md bg-primary-soft mb-4">
              <Sprout className="size-7 text-primary" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Gabino Agrogestión</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isForgot
                ? 'Recupera el acceso a tu cuenta'
                : isRegister
                  ? 'Crea tu cuenta'
                  : 'Gestión inteligente para el campo'}
            </p>
          </div>

          <div className="p-8 pt-4">
            <form onSubmit={isForgot ? handleForgotPassword : handleAuth} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="p-3 bg-destructive-soft border border-destructive/20 text-destructive text-sm rounded-md text-center"
                >
                  {error}
                </div>
              )}

              {success && (
                <div
                  role="status"
                  className="p-3 bg-success-soft border border-success/20 text-success text-sm rounded-md flex items-center gap-2.5"
                >
                  <CheckCircle2 className="size-4 shrink-0" strokeWidth={2} />
                  <span>{success}</span>
                </div>
              )}

              {isForgot && (
                <p className="text-xs text-muted-foreground text-center">
                  Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
                <div className="relative group">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors"
                    strokeWidth={1.75}
                  />
                  <input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {!isForgot && (
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-foreground">Contraseña</label>
                  <div className="relative group">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors"
                      strokeWidth={1.75}
                    />
                    <input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}

              {isRegister && (
                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">Confirmar contraseña</label>
                  <div className="relative group">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors"
                      strokeWidth={1.75}
                    />
                    <input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}

              {isRegister && (
                <div className="space-y-1.5">
                  <label htmlFor="celular" className="text-sm font-medium text-foreground">
                    Celular (WhatsApp) <span className="font-normal text-muted-foreground">— opcional</span>
                  </label>
                  <div className="relative group">
                    <Phone
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors"
                      strokeWidth={1.75}
                    />
                    <input
                      id="celular"
                      type="tel"
                      placeholder="+54 9 11 1234 5678"
                      value={celular}
                      onChange={(e) => setCelular(e.target.value)}
                      maxLength={32}
                      className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isForgot ? (
                  <>
                    <Mail className="size-4" strokeWidth={2} /> Enviar correo de recuperación
                  </>
                ) : isRegister ? (
                  <>
                    <UserPlus className="size-4" strokeWidth={2} /> Registrarse
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" strokeWidth={2} /> Iniciar sesión
                  </>
                )}
              </button>

              {!isForgot && !isRegister && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgot(true)
                      setError('')
                      setSuccess('')
                    }}
                    className="text-sm font-medium text-primary hover:underline transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="size-3.5" strokeWidth={2} />
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}

              {isForgot && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgot(false)
                      setError('')
                      setSuccess('')
                    }}
                    className="text-sm font-medium text-primary hover:underline transition-colors cursor-pointer"
                  >
                    Volver a iniciar sesión
                  </button>
                </div>
              )}

              {!isForgot && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(!isRegister)
                      setError('')
                      setSuccess('')
                    }}
                    className="text-sm font-medium text-primary hover:underline transition-colors cursor-pointer"
                  >
                    {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                  </button>
                </div>
              )}

              {!isRegister && !isForgot && (
                <>
                  <div className="relative my-5 text-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <span className="relative px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-card">
                      O continuar con
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    className="w-full py-2 bg-card border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
                    disabled={loading}
                  >
                    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google
                  </button>
                </>
              )}
            </form>
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-muted-foreground">
          © 2026 Gabino Agrogestión
        </p>
      </div>
    </div>
  )
}
