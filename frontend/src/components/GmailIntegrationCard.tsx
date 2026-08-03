import './GmailIntegrationCard.css';

export interface GmailIntegrationCardProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  connectedEmail?: string;
  connectedAt?: string;
  error?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function GmailIntegrationCard({
  status,
  connectedEmail,
  connectedAt,
  error,
  onConnect,
  onDisconnect,
}: GmailIntegrationCardProps) {
  return (
    <div className="gmail-integration-card">
      <div className="gmail-card-header">
        <div className="gmail-icon">📧</div>
        <div className="gmail-info">
          <h3>Gmail</h3>
          <p>Connect your Gmail account to analyze email communications</p>
        </div>
      </div>

      <div className="gmail-card-body">
        {status === 'disconnected' && (
          <div className="gmail-status-section">
            <button className="gmail-connect-btn" onClick={onConnect}>
              Connect
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="gmail-status-section">
            <div className="gmail-loading-spinner"></div>
            <p className="gmail-status-text">Connecting...</p>
          </div>
        )}

        {status === 'connected' && (
          <div className="gmail-status-section">
            <div className="gmail-connected-info">
              <div className="gmail-status-badge gmail-status-connected">
                <span className="gmail-status-dot"></span>
                Connected
              </div>
              {connectedEmail && (
                <p className="gmail-connected-email">{connectedEmail}</p>
              )}
              {connectedAt && (
                <p className="gmail-connected-date">Connected {connectedAt}</p>
              )}
            </div>
            <button className="gmail-disconnect-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="gmail-status-section">
            <div className="gmail-error-message">
              <span className="gmail-error-icon">⚠️</span>
              <p>{error || 'An error occurred. Please try again.'}</p>
            </div>
            <button className="gmail-connect-btn" onClick={onConnect}>
              Retry Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
