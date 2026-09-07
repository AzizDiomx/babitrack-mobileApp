import axios from 'axios';
import { getAccessToken, getRefreshToken, saveTokens } from './security';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://babitrack-backend.onrender.com';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur de requête : injection du token JWT
api.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Callback de déconnexion globale si le rafraîchissement échoue
let logoutCallback: (() => Promise<void> | void) | null = null;

export const setLogoutCallback = (cb: () => Promise<void> | void) => {
  logoutCallback = cb;
};

// Intercepteur de réponse : rafraîchissement transparent du token en cas de 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Si la requête échoue par 401 et que ce n'est pas déjà une tentative de retry
    if (
      error.response?.status === 401 && 
      !originalRequest._retry && 
      !originalRequest.url?.includes('/api/auth/login') &&
      !originalRequest.url?.includes('/api/auth/refresh')
    ) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          console.log('[API] Tentative de rafraîchissement du token JWT...');
          
          // Requête directe via axios pour éviter de boucler
          const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
          const newAccessToken = res.data.accessToken;
          
          // Sauvegarder les nouveaux tokens
          await saveTokens(newAccessToken, refreshToken);
          
          // Re-tenter la requête d'origine avec le nouveau token
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } else {
          console.warn('[API] Aucun refresh token trouvé. Déconnexion forcée...');
          if (logoutCallback) {
            await logoutCallback();
          }
        }
      } catch (refreshError) {
        console.error('[API] Échec du rafraîchissement du token:', refreshError);
        // Forcer le délog si le refresh échoue (ex: token expiré/invalide)
        if (logoutCallback) {
          await logoutCallback();
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
