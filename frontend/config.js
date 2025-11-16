// API Configuration
const API_CONFIG = {
  // Use production API when deployed, localhost when running locally
  BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://govli-ai.onrender.com',
  
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      REGISTER: '/api/auth/register'
    },
    PERMITS: {
      LIST: '/api/permits',
      CREATE: '/api/permits',
      GET: (id) => `/api/permits/${id}`
    },
    DASHBOARD: {
      METRICS: '/api/dashboard/metrics'
    }
  }
};

// Helper function to make API calls
async function apiCall(endpoint, options = {}) {
  const url = API_CONFIG.BASE_URL + endpoint;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    }
  };
  
  // Add auth token if available
  const token = localStorage.getItem('authToken');
  if (token) {
    defaultOptions.headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }
  
  return response.json();
}
