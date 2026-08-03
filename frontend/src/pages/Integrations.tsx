import { useState, useEffect } from 'react';
import './Integrations.css';
import { GmailIntegrationCard } from '../components/GmailIntegrationCard';
import { SlackIntegrationCard } from '../components/SlackIntegrationCard';
import {
  initiateOAuth as initiateGmailOAuth,
  getIntegrationStatus as getGmailStatus,
  disconnectIntegration as disconnectGmail,
  GmailIntegrationError,
  type IntegrationStatus as GmailIntegrationStatus,
} from '../api/gmailIntegration';
import {
  initiateOAuth as initiateSlackOAuth,
  getIntegrationStatus as getSlackStatus,
  disconnectIntegration as disconnectSlack,
  SlackIntegrationError,
  type IntegrationStatus as SlackIntegrationStatus,
} from '../api/slackIntegration';

interface GmailState {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  connectedEmail?: string;
  connectedAt?: string;
  error?: string;
}

interface SlackState {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  workspaceName?: string;
  connectedAt?: string;
  error?: string;
}

interface StatusMessage {
  type: 'success' | 'error';
  text: string;
  timestamp: number;
}

export function Integrations() {
  const [gmailState, setGmailState] = useState<GmailState>({
    status: 'disconnected',
  });
  const [slackState, setSlackState] = useState<SlackState>({
    status: 'disconnected',
  });
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch integration status on page load
  useEffect(() => {
    fetchIntegrationStatus();
  }, []);

  // Handle OAuth callback on mount
  useEffect(() => {
    handleOAuthCallback();
  }, []);

  // Auto-clear status messages after 5 seconds (per requirement 8.5)
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  /**
   * Fetch the current Gmail integration status from the backend
   */
  const fetchIntegrationStatus = async () => {
    try {
      setIsLoading(true);
      
      // Fetch both Gmail and Slack statuses in parallel
      const [gmailStatus, slackStatus] = await Promise.all([
        getGmailStatus(),
        getSlackStatus(),
      ]);
      
      // Update Gmail state
      if (gmailStatus.status === 'connected') {
        setGmailState({
          status: 'connected',
          connectedEmail: gmailStatus.email,
          connectedAt: gmailStatus.connectedAt ? formatDate(gmailStatus.connectedAt) : undefined,
        });
      } else if (gmailStatus.status === 'error') {
        setGmailState({
          status: 'error',
          error: gmailStatus.errorMessage || 'Connection error. Please try reconnecting.',
        });
      } else {
        setGmailState({
          status: 'disconnected',
        });
      }
      
      // Update Slack state
      if (slackStatus.status === 'connected') {
        setSlackState({
          status: 'connected',
          workspaceName: slackStatus.workspaceName,
          connectedAt: slackStatus.connectedAt ? formatDate(slackStatus.connectedAt) : undefined,
        });
      } else if (slackStatus.status === 'error') {
        setSlackState({
          status: 'error',
          error: slackStatus.errorMessage || 'Connection error. Please try reconnecting.',
        });
      } else {
        setSlackState({
          status: 'disconnected',
        });
      }
    } catch (error) {
      console.error('Failed to fetch integration status:', error);
      
      // Log detailed error information for debugging
      if (error instanceof GmailIntegrationError) {
        console.error('Gmail error details:', {
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        });
      }
      if (error instanceof SlackIntegrationError) {
        console.error('Slack error details:', {
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        });
      }
      
      // Always default to disconnected state on error during status check
      // This prevents showing "Connection failed" when user simply hasn't connected yet
      setGmailState({
        status: 'disconnected',
      });
      setSlackState({
        status: 'disconnected',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle OAuth callback from Google and Slack
   * Checks URL parameters for success/error status
   */
  const handleOAuthCallback = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gmailParam = urlParams.get('gmail');
    const slackParam = urlParams.get('slack');
    const errorParam = urlParams.get('error');
    const messageParam = urlParams.get('message');

    // Handle Gmail callback
    if (gmailParam === 'connected') {
      setStatusMessage({
        type: 'success',
        text: 'Gmail connected successfully!',
        timestamp: Date.now(),
      });
      // Refresh status to get the connected email
      fetchIntegrationStatus();
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
    } else if (gmailParam === 'error') {
      const errorMessage = getGmailErrorMessage(errorParam, messageParam);
      setStatusMessage({
        type: 'error',
        text: errorMessage,
        timestamp: Date.now(),
      });
      setGmailState({
        status: 'error',
        error: errorMessage,
      });
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
    }
    
    // Handle Slack callback
    if (slackParam === 'connected') {
      setStatusMessage({
        type: 'success',
        text: 'Slack connected successfully!',
        timestamp: Date.now(),
      });
      // Refresh status to get the connected workspace
      fetchIntegrationStatus();
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
    } else if (slackParam === 'error') {
      const errorMessage = getSlackErrorMessage(errorParam, messageParam);
      setStatusMessage({
        type: 'error',
        text: errorMessage,
        timestamp: Date.now(),
      });
      setSlackState({
        status: 'error',
        error: errorMessage,
      });
      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
    }
  };

  /**
   * Get user-friendly error message based on error code for Gmail
   */
  const getGmailErrorMessage = (errorCode: string | null, message: string | null): string => {
    if (message) {
      return decodeURIComponent(message);
    }

    switch (errorCode) {
      case 'access_denied':
      case 'cancelled':
        return 'Connection cancelled. You can try again when ready.';
      case 'invalid_state':
        return 'Invalid request. Please try connecting again.';
      case 'token_exchange_failed':
        return 'Authorization failed. Please check your Google account and try again.';
      case 'storage_failed':
        return 'Unable to secure connection. Please try again.';
      default:
        return 'Connection failed. Please try again.';
    }
  };

  /**
   * Get user-friendly error message based on error code for Slack
   */
  const getSlackErrorMessage = (errorCode: string | null, message: string | null): string => {
    if (message) {
      return decodeURIComponent(message);
    }

    switch (errorCode) {
      case 'access_denied':
      case 'cancelled':
        return 'Connection cancelled. You can try again when ready.';
      case 'invalid_state':
        return 'Invalid request. Please try connecting again.';
      case 'token_exchange_failed':
        return 'Authorization failed. Please check your Slack workspace and try again.';
      case 'storage_failed':
        return 'Unable to secure connection. Please try again.';
      default:
        return 'Connection failed. Please try again.';
    }
  };

  /**
   * Format ISO date string to relative time
   */
  const formatDate = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return isoDate;
    }
  };

  /**
   * Handle Gmail connect button click
   * Initiates OAuth flow by redirecting to Google authorization URL
   */
  const handleGmailConnect = async () => {
    try {
      setGmailState({ status: 'connecting' });
      const { authorizationUrl } = await initiateGmailOAuth();
      
      // Log successful OAuth initiation for debugging
      console.log('Gmail OAuth flow initiated successfully');
      
      // Redirect to Google OAuth page
      window.location.href = authorizationUrl;
    } catch (error) {
      console.error('Failed to initiate Gmail OAuth:', error);
      
      // Log detailed error information for debugging
      if (error instanceof GmailIntegrationError) {
        console.error('Error details:', {
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        });
      }
      
      const errorMessage = error instanceof GmailIntegrationError
        ? error.message
        : 'Failed to initiate Gmail connection. Please try again.';
      
      setGmailState({
        status: 'error',
        error: errorMessage,
      });
      setStatusMessage({
        type: 'error',
        text: errorMessage,
        timestamp: Date.now(),
      });
    }
  };

  /**
   * Handle Gmail disconnect button click
   * Removes OAuth tokens and revokes access
   */
  const handleGmailDisconnect = async () => {
    try {
      setGmailState({ status: 'connecting' });
      const result = await disconnectGmail();
      
      if (result.success) {
        console.log('Gmail disconnected successfully');
        setGmailState({ status: 'disconnected' });
        setStatusMessage({
          type: 'success',
          text: 'Gmail disconnected successfully.',
          timestamp: Date.now(),
        });
      } else {
        throw new Error(result.message || 'Disconnect failed');
      }
    } catch (error) {
      console.error('Failed to disconnect Gmail:', error);
      
      // Log detailed error information for debugging
      if (error instanceof GmailIntegrationError) {
        console.error('Error details:', {
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        });
      }
      
      const errorMessage = error instanceof GmailIntegrationError
        ? error.message
        : 'Failed to disconnect Gmail. Please try again.';
      
      // Even if disconnect fails, refresh status to get current state
      await fetchIntegrationStatus();
      
      setStatusMessage({
        type: 'error',
        text: errorMessage,
        timestamp: Date.now(),
      });
    }
  };

  /**
   * Handle Slack connect button click
   * Initiates OAuth flow by redirecting to Slack authorization URL
   */
  const handleSlackConnect = async () => {
    try {
      setSlackState({ status: 'connecting' });
      const { authorizationUrl } = await initiateSlackOAuth();
      
      // Log successful OAuth initiation for debugging
      console.log('Slack OAuth flow initiated successfully');
      
      // Redirect to Slack OAuth page
      window.location.href = authorizationUrl;
    } catch (error) {
      console.error('Failed to initiate Slack OAuth:', error);
      
      // Log detailed error information for debugging
      if (error instanceof SlackIntegrationError) {
        console.error('Error details:', {
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        });
      }
      
      const errorMessage = error instanceof SlackIntegrationError
        ? error.message
        : 'Failed to initiate Slack connection. Please try again.';
      
      setSlackState({
        status: 'error',
        error: errorMessage,
      });
      setStatusMessage({
        type: 'error',
        text: errorMessage,
        timestamp: Date.now(),
      });
    }
  };

  /**
   * Handle Slack disconnect button click
   * Removes OAuth tokens and revokes access
   */
  const handleSlackDisconnect = async () => {
    try {
      setSlackState({ status: 'connecting' });
      const result = await disconnectSlack();
      
      if (result.success) {
        console.log('Slack disconnected successfully');
        setSlackState({ status: 'disconnected' });
        setStatusMessage({
          type: 'success',
          text: 'Slack disconnected successfully.',
          timestamp: Date.now(),
        });
      } else {
        throw new Error(result.message || 'Disconnect failed');
      }
    } catch (error) {
      console.error('Failed to disconnect Slack:', error);
      
      // Log detailed error information for debugging
      if (error instanceof SlackIntegrationError) {
        console.error('Error details:', {
          message: error.message,
          statusCode: error.statusCode,
          originalError: error.originalError,
        });
      }
      
      const errorMessage = error instanceof SlackIntegrationError
        ? error.message
        : 'Failed to disconnect Slack. Please try again.';
      
      // Even if disconnect fails, refresh status to get current state
      await fetchIntegrationStatus();
      
      setStatusMessage({
        type: 'error',
        text: errorMessage,
        timestamp: Date.now(),
      });
    }
  };

  return (
    <div className="integrations-page">
      <h1>Integrations</h1>

      {/* Status Messages */}
      {statusMessage && (
        <div className={`status-message status-message-${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Gmail Integration Section */}
      <section className="gmail-integration-section">
        <h2>Gmail Integration</h2>
        {isLoading ? (
          <div className="loading-state">Loading...</div>
        ) : (
          <GmailIntegrationCard
            status={gmailState.status}
            connectedEmail={gmailState.connectedEmail}
            connectedAt={gmailState.connectedAt}
            error={gmailState.error}
            onConnect={handleGmailConnect}
            onDisconnect={handleGmailDisconnect}
          />
        )}
      </section>

      {/* Slack Integration Section */}
      <section className="slack-integration-section">
        <h2>Slack Integration</h2>
        {isLoading ? (
          <div className="loading-state">Loading...</div>
        ) : (
          <SlackIntegrationCard
            status={slackState.status}
            workspaceName={slackState.workspaceName}
            connectedAt={slackState.connectedAt}
            error={slackState.error}
            onConnect={handleSlackConnect}
            onDisconnect={handleSlackDisconnect}
          />
        )}
      </section>

      {/* Coming Soon Section */}
      <section className="coming-soon-integrations">
        <h2>Coming Soon</h2>
        <div className="integration-grid">
          <div className="integration-card integration-card-disabled">
            <div className="integration-icon">📅</div>
            <h3>Google Calendar</h3>
            <p>Sync your calendar events and meetings</p>
            <button className="connect-btn" disabled>Coming Soon</button>
          </div>
        </div>
      </section>
    </div>
  );
}
