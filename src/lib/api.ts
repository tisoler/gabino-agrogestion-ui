import axios, { AxiosError } from 'axios'
import { auth } from './firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3063/api'
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Función auxiliar para esperar a que Firebase inicialice o devuelva el token actual
const getAuthToken = (): Promise<string | null> => {
  return new Promise((resolve) => {
    // Si ya existe el usuario cargado en memoria, obtenemos el token
    if (auth.currentUser) {
      resolve(auth.currentUser.getIdToken());
      return;
    }

    // Si no, escuchamos el cambio de estado una sola vez para capturar la inicialización
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      if (user) {
        resolve(user.getIdToken());
      } else {
        resolve(null);
      }
    });
  });
}

// Interceptor para agregar el token a las peticiones
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      
      const currentEmpresaId = localStorage.getItem('currentEmpresaId')
      if (currentEmpresaId) {
        config.headers['x-empresa-id'] = currentEmpresaId
      }
    } catch (error) {
      console.error('Error al obtener token de Firebase:', error);
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor simple
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Redirigir al login si es necesario
    }
    return Promise.reject(error)
  }
)

// fetcher para SWR
export const fetcher = (url: string) => api.get(url).then(res => res.data)

export default api
