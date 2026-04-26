const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** URL для картинок: локальные пути /static/... или внешние http(s) */
export function imageUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url.startsWith('/') ? url : '/' + url}`;
}

/** Placeholder при ошибке загрузки локальной картинки */
export const IMG_PLACEHOLDER = 'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=600';

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

function saveTokens(tokens: { access_token: string; refresh_token: string }) {
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }

      const text = await res.text();
      if (!text) {
        clearTokens();
        return null;
      }

      const data = JSON.parse(text) as { access_token: string; refresh_token: string };
      if (!data.access_token || !data.refresh_token) {
        clearTokens();
        return null;
      }

      saveTokens(data);
      return data.access_token;
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowRetry = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const canRefresh =
    allowRetry &&
    res.status === 401 &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/refresh');

  if (canRefresh) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return request<T>(path, options, false);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
    throw new ApiError(
      (data as { detail?: string })?.detail || `HTTP ${res.status}`,
      res.status,
      data
    );
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function uploadFile(path: string, file: File, allowRetry = true): Promise<{ image_url: string }> {
  const fd = new FormData()
  fd.append('file', file)
  let token = getToken()
  if (!token && allowRetry) {
    token = await refreshAccessToken()
  }
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    headers['X-Auth-Token'] = token
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: fd,
    credentials: 'same-origin',
  })
  const canRefresh =
    allowRetry &&
    res.status === 401 &&
    !path.startsWith('/auth/')
  if (canRefresh) {
    const newToken = await refreshAccessToken()
    if (newToken) return uploadFile(path, file, false)
  }
  if (!res.ok) {
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { detail: text }
    }
    throw new ApiError(
      (data as { detail?: string })?.detail || `HTTP ${res.status}`,
      res.status,
      data
    )
  }
  return res.json() as Promise<{ image_url: string }>
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: (path: string, file: File) => uploadFile(path, file),
};

export { ApiError };

export type AuthTokens = { access_token: string; refresh_token: string };
export type UserProfile = {
  user_id: string;
  nickname?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  equipment_type?: 'ski' | 'snowboard';
  favorite_resorts: string[];
  total_distance?: number;
  total_descent?: number;
};
export type Resort = {
  id: number;
  name: string;
  description?: string;
  image_url?: string;
  rating?: number;
  review_count?: number;
  track_length_km?: number;
  elevation_drop_m?: number;
  trails_green?: number;
  trails_blue?: number;
  trails_red?: number;
  trails_black?: number;
  freeride_rating?: number;
  beginner_friendly?: boolean;
};
export type Lesson = { id: number; title: string; category?: string; lesson_url: string; preview_url?: string };
export type EquipmentCategory = { id: number; name: string };
export type EquipmentItem = {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  price?: number;
  owner_id?: number;
  image_url?: string;
  address?: string;
  price_per_day?: number;
  condition?: string;
  equipment_type?: string;
};
export type Hotel = {
  id: number;
  name: string;
  description?: string;
  image_url?: string;
  gallery_urls?: string[];
  room_photo_urls?: string[];
  price_from?: number;
  currency?: string;
  booking_url?: string;
  resort_id?: number;
  rating?: number;
};
export type SkipassTariff = {
  id: number;
  resort_id: number;
  season_name: string;
  season_start: string;
  season_end: string;
  age_category: 'child' | 'teen' | 'adult' | 'senior';
  access_type: 'day' | 'evening' | 'full';
  duration_days: number;
  is_fast_track: boolean;
  price: number;
  currency: string;
  is_active: boolean;
};
export type SkipassTariffCreate = Omit<SkipassTariff, 'id' | 'resort_id'>;
export type SkipassPriceResponse = {
  price: number;
  currency: string;
  tariff_id?: number | null;
  season_name?: string | null;
};
export type CurrentWeather = {
  resortId: number;
  temperature: number;
  windSpeed: number;
  humidity: number;
  condition: string;
  timestamp: string;
};

export type AltitudePointWeather = {
  point_id: number;
  point_name: string;
  altitude_m: number;
  temperature: number;
  windSpeed: number;
  humidity: number;
  condition: string;
  timestamp: string;
};

export type AltitudeHourlyEntry = {
  timestamp: string;
  temperature: number;
  windSpeed: number;
  humidity: number;
  precipitation: number;
  condition: string;
};

export type AltitudePointHourlyForecast = {
  point_id: number;
  point_name: string;
  altitude_m: number;
  hours: AltitudeHourlyEntry[];
};

export type AltitudeDailyEntry = {
  date: string;
  minTemperature: number;
  maxTemperature: number;
  windSpeed: number;
  precipitation: number;
  condition: string;
};

export type AltitudePointDailyForecast = {
  point_id: number;
  point_name: string;
  altitude_m: number;
  days: AltitudeDailyEntry[];
};

export type AltitudePointCreate = {
  name: string;
  altitude_m: number;
  latitude: number;
  longitude: number;
  is_active?: boolean;
};

export type AltitudePoint = {
  id: number;
  resort_id: number;
  name: string;
  altitude_m: number;
  latitude: number;
  longitude: number;
  is_active: boolean;
};

export type ResortReview = {
  id: number;
  resort_id: number;
  user_id: number;
  rating: number;
  review_text?: string;
  created_at: string;
  updated_at: string;
};

export type ResortReviewCreate = {
  rating: number;
  review_text?: string;
};

export type TrackPoint = {
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  timestamp: string;
};

export type Track = {
  id: number;
  user_id: number;
  started_at: string;
  ended_at: string;
  max_speed: number;
  avg_speed: number;
  distance: number;
  total_descent: number;
  total_ascent: number;
  points: TrackPoint[];
};

export type UserStats = {
  total_distance: number;
  total_descent: number;
  max_speed: number;
  total_tracks: number;
};
