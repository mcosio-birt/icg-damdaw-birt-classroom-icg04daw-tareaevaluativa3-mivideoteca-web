import { PUBLIC_API_URL } from '$env/static/public';
import { authToken } from './auth.store.svelte';
import type {
  ApiErrorPayload,
  Credentials,
  LoginResponse,
  Movie,
  MoviePayload,
  RegisterPayload,
} from './types';

// Configuración base del servicio API
const FALLBACK_API_URL = 'http://localhost:3000';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean; // Si incluir token de autenticación
}

// Excepción personalizada para errores de API
// Distingue errores de red vs errores de lógica de negocio
export class ApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, options?: { status?: number; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.details = options?.details;
  }
}

// URL base: configurada desde variables de entorno con fallback
function sanitizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return FALLBACK_API_URL;
  }
  // Elimina barras finales para evitar URLs malformadas
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

// ✅ Configuración para SvelteKit: usa PUBLIC_ prefix
const API_BASE_URL = sanitizeBaseUrl(
  PUBLIC_API_URL ?? FALLBACK_API_URL
);

// Función central: wrapper genérico para todas las peticiones HTTP
// Añade headers, autenticación y manejo de errores homogéneo
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers = new Headers();

  // Content-Type automático para peticiones con body
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  // Autenticación JWT automática (excepto login/register)
  if (auth) {
    const token = authToken.value; // Svelte 5: acceso directo al valor
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError('No se pudo conectar con el servidor.', { details: error });
  }

  let payload: unknown = null;
  const isJson = response.headers.get('content-type')?.includes('application/json');

  if (response.status !== 204 && isJson) {
    try {
      payload = await response.json();
    } catch (error) {
      throw new ApiError('El servidor devolvió una respuesta inválida.', {
        status: response.status,
        details: error,
      });
    }
  } else if (response.status !== 204) {
    payload = await response.text();
  }

  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload;
    const serverMessage =
      typeof errorPayload === 'object' ? errorPayload.error ?? errorPayload.message : undefined;
    throw new ApiError(serverMessage ?? 'Ocurrió un error inesperado.', {
      status: response.status,
      details: payload,
    });
  }

  return payload as T;
}

export const api = {
  // Inicia sesión y obtiene el token JWT emitido por el backend.
  login: (credentials: Credentials) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body: credentials, auth: false }),
  // Crea un nuevo usuario y reutiliza la misma validación que la app móvil.
  register: (payload: RegisterPayload) =>
    request<void>('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  // Recupera las películas protegidas por token.
  getMovies: () => request<Movie[]>('/api/movies'),
  // Crea una película asociada al usuario conectado.
  createMovie: (payload: MoviePayload) =>
    request<Movie>('/api/movies', { method: 'POST', body: payload }),
  // Actualiza la película seleccionada desde la vista de edición.
  updateMovie: (id: string, payload: MoviePayload) =>
    request<Movie>(`/api/movies/${id}`, { method: 'PUT', body: payload }),
  // Elimina la película de la base de datos y de la lista local.
  deleteMovie: (id: string) => request<void>(`/api/movies/${id}`, { method: 'DELETE' }),

  // TODO (UD4 - Video): toggleFavorite
  // TODO (UD4 - Ejercicio): rateMovie
};
