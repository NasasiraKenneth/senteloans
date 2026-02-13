import { toast, ToastOptions } from 'react-hot-toast';

// Default toast options
const defaultOptions: ToastOptions = {
  duration: 4000,
  position: 'top-right',
  style: {
    minWidth: '300px',
    maxWidth: '500px',
  },
};

// Success toast with custom styling
export const showSuccess = (message: string, options?: ToastOptions) => {
  return toast.success(message, {
    ...defaultOptions,
    style: {
      ...defaultOptions.style,
      background: '#ECFDF5',
      color: '#065F46',
      border: '1px solid #A7F3D0',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '14px',
      fontWeight: '500',
    },
    iconTheme: {
      primary: '#10B981',
      secondary: '#ECFDF5',
    },
    ...options,
  });
};

// Error toast with custom styling
export const showError = (message: string, options?: ToastOptions) => {
  return toast.error(message, {
    ...defaultOptions,
    duration: 6000, // Longer duration for errors
    style: {
      ...defaultOptions.style,
      background: '#FEF2F2',
      color: '#991B1B',
      border: '1px solid #FECACA',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '14px',
      fontWeight: '500',
    },
    iconTheme: {
      primary: '#DC2626',
      secondary: '#FEF2F2',
    },
    ...options,
  });
};

// Warning toast with custom styling
export const showWarning = (message: string, options?: ToastOptions) => {
  return toast(message, {
    ...defaultOptions,
    style: {
      ...defaultOptions.style,
      background: '#FFFBEB',
      color: '#92400E',
      border: '1px solid #FED7AA',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '14px',
      fontWeight: '500',
    },
    icon: '⚠️',
    ...options,
  });
};

// Info toast with custom styling
export const showInfo = (message: string, options?: ToastOptions) => {
  return toast(message, {
    ...defaultOptions,
    style: {
      ...defaultOptions.style,
      background: '#EFF6FF',
      color: '#1E40AF',
      border: '1px solid #BFDBFE',
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '14px',
      fontWeight: '500',
    },
    icon: 'ℹ️',
    ...options,
  });
};

// API error handler
export const showApiError = (error: any, fallbackMessage = 'An error occurred') => {
  let message = fallbackMessage;
  
  if (error?.response?.data?.message) {
    message = error.response.data.message;
  } else if (error?.response?.data?.error) {
    message = error.response.data.error;
  } else if (error?.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  // Handle specific HTTP status codes
  if (error?.response?.status) {
    switch (error.response.status) {
      case 400:
        message = `Bad Request: ${message}`;
        break;
      case 401:
        message = 'Unauthorized: Please log in again';
        break;
      case 403:
        message = 'Forbidden: You do not have permission to perform this action';
        break;
      case 404:
        message = 'Not Found: The requested resource was not found';
        break;
      case 409:
        message = `Conflict: ${message}`;
        break;
      case 422:
        message = `Validation Error: ${message}`;
        break;
      case 500:
        message = 'Server Error: Please try again later';
        break;
      case 502:
      case 503:
      case 504:
        message = 'Service Unavailable: Please try again later';
        break;
    }
  }

  return showError(message);
};

// Network error handler
export const showNetworkError = () => {
  return showError('Network Error: Please check your internet connection and try again');
};

// Export the original toast for custom usage
export { toast }; 