import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  signOut,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'
import { Sprout, Mail, Lock, Loader2, UserPlus, LogIn, CheckCircle2 } from 'lucide-react'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

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
        await sendEmailVerification(userCredential.user)
        setSuccess('¡Cuenta creada! Por favor, verifica tu email para poder ingresar.')
        // Nos deslogueamos para forzar que verifiquen antes de entrar
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
    } catch (err: any) {
      console.error(err)
      if (isRegister) {
        if (err.code === 'auth/email-already-in-use') {
          setError('El email ya está en uso.')
        } else if (err.code === 'auth/weak-password') {
          setError('La contraseña es demasiado débil.')
        } else {
          setError('Error al crear la cuenta. Inténtalo de nuevo.')
        }
      } else {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
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
      navigate('/')
    } catch (err: any) {
      setError('Error al iniciar sesión con Google.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Background Image with Blur */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat filter blur-xs scale-110"
          style={{ backgroundImage: 'url("fondoLogin.png")' }}
        />
      </div>

      {/* Decorative Circles */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl animate-pulse decoration-1000" />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="bg-card/80 dark:bg-card/40 border border-border shadow-2xl rounded-3xl overflow-hidden backdrop-blur-xl transition-all duration-300">
          <div className="p-8 pb-4 text-center">
            <div className="inline-flex p-3 rounded-2xl bg-primary/10 mb-4 shadow-inner">
              <Sprout className="size-10 text-primary" />
            </div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Gabino Agrogestión</h1>
            <p className="text-muted-foreground font-medium mt-1">
              {isRegister ? 'Crea tu cuenta' : 'Gestión inteligente para el campo'}
            </p>
          </div>

          <div className="p-8 pt-4">
            <form onSubmit={handleAuth} className="space-y-5">
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive dark:text-red-500 text-sm rounded-xl text-center font-medium transition-all animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm rounded-xl flex items-center gap-3 font-medium animate-in fade-in slide-in-from-top-1">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground px-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60 text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground px-1">Contraseña</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60 text-foreground"
                  />
                </div>
              </div>

              {isRegister && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-sm font-semibold text-foreground px-1">Confirmar Contraseña</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 bg-accent/30 dark:bg-accent/10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60 text-foreground"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : isRegister ? (
                  <>
                    <UserPlus className="size-5" /> Registrarse
                  </>
                ) : (
                  <>
                    <LogIn className="size-5" /> Iniciar Sesión
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-sm font-semibold text-primary hover:underline transition-all cursor-pointer"
                >
                  {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                </button>
              </div>

              {!isRegister && (
                <>
                  <div className="relative my-6 text-center">
                    <div className="absolute inset-0 flex items-center px-4 mb-6">
                      <div className="w-full border-t border-border" />
                    </div>
                    <span className="relative px-3 text-[10px] font-black uppercase text-muted-foreground/60 bg-transparent tracking-widest">
                      O continuar con
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAuth}
                    className="w-full py-3 bg-card border border-border rounded-xl font-bold flex items-center justify-center gap-3 text-foreground hover:bg-accent hover:border-border transition-all hover:shadow-sm cursor-pointer"
                    disabled={loading}
                  >
                    <svg className="size-5" viewBox="0 0 24 24">
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

        <p className="text-center mt-8 text-sm text-muted-foreground/40 font-bold tracking-tight">
          &copy; 2026 GABINO AGROGESTIÓN.
        </p>
      </div>
    </div>
  )
}

