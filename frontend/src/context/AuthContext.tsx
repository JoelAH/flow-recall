import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authConfig } from '../config/auth';

// Token storage key
const TOKEN_STORAGE_KEY = 'flowrecall_auth_tokens';

// Type definitions
export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface User {
  email: string;
  sub: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (tokens: AuthTokens) => void;
  logout: () => void;
  loading: boolean;
}

interface AuthProviderProps {
  children: ReactNode;
}

// Create the authentication context
const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Helper function to get tokens from localStorage
 * @returns Token object or null if not found
 */
export const getTokens = (): AuthTokens | null => {
  try {
    const tokensJson = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!tokensJson) return null;
    return JSON.parse(tokensJson) as AuthTokens;
  } catch (error) {
    console.error('Error reading tokens from localStorage:', error);
    return null;
  }
};

/**
 * Helper function to store tokens in localStorage
 * @param tokens - Token object containing idToken, accessToken, refreshToken, expiresAt
 */
export const setTokens = (tokens: AuthTokens): void => {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error('Error storing tokens in localStorage:', error);
  }
};

/**
 * Helper function to clear tokens from localStorage
 */
export const clearTokens = (): void => {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing tokens from localStorage:', error);
  }
};

/**
 * Check if tokens are expired
 * @param tokens - Token object with expiresAt timestamp
 * @returns True if tokens are expired
 */
const areTokensExpired = (tokens: AuthTokens | null): boolean => {
  if (!tokens || !tokens.expiresAt) return true;
  return Date.now() >= tokens.expiresAt;
};

/**
 * Decode JWT token payload
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
const decodeToken = (token: string): User | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decodedPayload = JSON.parse(atob(payload));
    return {
      email: decodedPayload.email,
      sub: decodedPayload.sub
    };
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * AuthProvider component that manages authentication state
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = () => {
      const tokens = getTokens();
      
      if (!tokens) {
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return;
      }

      // Check if tokens are expired
      if (areTokensExpired(tokens)) {
        // Tokens expired, clear them and redirect to login
        clearTokens();
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        window.location.href = '/login';
        return;
      }

      // Tokens are valid, restore session
      setIsAuthenticated(true);
      
      // Decode user info from idToken
      const decodedUser = decodeToken(tokens.idToken);
      if (decodedUser) {
        setUser(decodedUser);
      }
      
      setLoading(false);
    };

    initializeSession();
  }, []);

  /**
   * Login function - stores tokens and sets authenticated state
   * @param tokens - Token object from Cognito
   */
  const login = (tokens: AuthTokens): void => {
    setTokens(tokens);
    setIsAuthenticated(true);
    
    // Decode user info from idToken
    const decodedUser = decodeToken(tokens.idToken);
    if (decodedUser) {
      setUser(decodedUser);
    }
  };

  /**
   * Logout function - clears tokens and redirects to Cognito logout
   */
  const logout = (): void => {
    // Clear tokens from localStorage
    clearTokens();
    
    // Set authenticated state to false
    setIsAuthenticated(false);
    setUser(null);
    
    // Redirect to Cognito logout URL
    const logoutUrl = `https://${authConfig.cognitoDomain}/logout?client_id=${authConfig.userPoolClientId}&logout_uri=${encodeURIComponent(authConfig.logoutUri)}`;
    window.location.href = logoutUrl;
  };

  const value: AuthContextType = {
    isAuthenticated,
    user,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook to use the auth context
 * @returns Auth context value
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
