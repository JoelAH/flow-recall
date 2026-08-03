import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authConfig } from '../config/auth';
import type { AuthTokens } from '../context/AuthContext';

/**
 * Callback component that handles OAuth redirect from Cognito
 * Exchanges authorization code for tokens and stores them
 */
export const Callback = () => {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse URL parameters
        const params = new URLSearchParams(window.location.search);
        
        // Check for error from Cognito
        const errorParam = params.get('error');
        if (errorParam) {
          const errorDescription = params.get('error_description');
          handleAuthError(errorParam, errorDescription);
          return;
        }

        // Get authorization code
        const code = params.get('code');
        if (!code) {
          setError('No authorization code received. Please try signing in again.');
          setProcessing(false);
          return;
        }

        // Exchange code for tokens
        await exchangeCodeForTokens(code);
      } catch (err) {
        console.error('Callback error:', err);
        setError('An unexpected error occurred. Please try again.');
        setProcessing(false);
      }
    };

    handleCallback();
  }, []);

  /**
   * Handle authentication errors from Cognito
   */
  const handleAuthError = (errorCode: string, errorDescription: string | null) => {
    let errorMessage: string;

    switch (errorCode) {
      case 'access_denied':
        errorMessage = 'You declined to sign in with Google';
        break;
      case 'invalid_request':
        errorMessage = 'Authentication request was invalid. Please try again.';
        break;
      case 'unauthorized_client':
        errorMessage = 'Authentication service is not properly configured.';
        break;
      case 'server_error':
        errorMessage = 'Authentication service unavailable. Please try again later.';
        break;
      default:
        errorMessage = errorDescription || 'Authentication failed. Please try again.';
    }

    setError(errorMessage);
    setProcessing(false);
  };

  /**
   * Exchange authorization code for tokens using Cognito token endpoint
   */
  const exchangeCodeForTokens = async (code: string) => {
    try {
      // Build token endpoint URL
      const tokenUrl = `https://${authConfig.cognitoDomain}/oauth2/token`;

      // Build request body
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: authConfig.userPoolClientId,
        code: code,
        redirect_uri: authConfig.redirectUri
      });

      // Make token exchange request
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      if (!response.ok) {
        // Handle HTTP errors
        if (response.status === 400) {
          setError('Authentication session expired. Please sign in again.');
        } else if (response.status >= 500) {
          setError('Authentication service unavailable. Please try again later.');
        } else {
          setError('Unable to complete authentication. Please try again.');
        }
        setProcessing(false);
        return;
      }

      // Parse token response
      const data = await response.json();

      // Calculate token expiration time
      const expiresAt = Date.now() + (data.expires_in * 1000);

      // Create tokens object
      const tokens: AuthTokens = {
        idToken: data.id_token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: expiresAt
      };

      // Store tokens via AuthContext
      login(tokens);

      // Redirect to main app
      window.location.href = '/';
    } catch (err) {
      console.error('Token exchange error:', err);
      
      // Check if it's a network error
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Unable to connect. Please check your internet connection.');
      } else {
        setError('Unable to complete authentication. Please try again.');
      }
      
      setProcessing(false);
    }
  };

  /**
   * Redirect back to login page
   */
  const handleRetry = () => {
    window.location.href = '/login';
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src="/flow-recall.png" alt="FlowRecall" className="login-logo" />
          {processing ? (
            <>
              <h1>Signing you in...</h1>
              <p>Please wait while we complete authentication</p>
            </>
          ) : (
            <>
              <h1>Authentication Failed</h1>
              <p>We couldn't complete your sign in</p>
            </>
          )}
        </div>

        {error && (
          <>
            <div className="login-error">
              {error}
            </div>
            <button 
              className="google-signin-button"
              onClick={handleRetry}
            >
              Try Again
            </button>
          </>
        )}

        {processing && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
};
