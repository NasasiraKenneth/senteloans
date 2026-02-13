import axios from 'axios';
import { showApiError, showNetworkError } from './toast';

const isDevelopment = process.env.NODE_ENV === 'development';
// const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const getBaseUrl = () => {
  // If NEXT_PUBLIC_API_URL is set, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (isDevelopment) {
    return 'http://127.0.0.1:8000/api/v1';
  }

  // In production, detect if we're on HTTPS and use appropriate protocol
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}/api/v1`;
  }
  return '/api/v1';
};

const baseURL = getBaseUrl();
const axiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies for session-based auth
});

// Add request interceptor for development mode
if (isDevelopment) {
  axiosInstance.interceptors.request.use((config) => {
    // Add basic auth header for localhost development
    config.auth = {
      username: 'ekeeya',
      password: '12345678',
    };
    return config;
  });
}

// Add request interceptor to ensure HTTPS in production
if (!isDevelopment) {
  axiosInstance.interceptors.request.use((config) => {
    if (config.url && config.url.startsWith('http://')) {
      config.url = config.url.replace('http://', 'https://');
    }
    if (config.baseURL && config.baseURL.startsWith('http://')) {
      config.baseURL = config.baseURL.replace('http://', 'https://');
    }

    return config;
  });
}
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response) {
        if (error.response.status === 401) {
          window.location.href="/login"
        } else {
          showApiError(error);
        }
      } else if (error.request) {
        showNetworkError();
      } else {
        showApiError(error);
      }

      return Promise.reject(error);
    }
);

export default axiosInstance;
