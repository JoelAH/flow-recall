import './SlackIntegrationCard.css';

export interface SlackIntegrationCardProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  workspaceName?: string;
  connectedAt?: string;
  error?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function SlackIntegrationCard({
  status,
  workspaceName,
  connectedAt,
  error,
  onConnect,
  onDisconnect,
}: SlackIntegrationCardProps) {
  return (
    <div className="slack-integration-card">
      <div className="slack-card-header">
        <div className="slack-icon">💬</div>
        <div className="slack-info">
          <h3>Slack</h3>
          <p>Connect your Slack workspace to analyze messages and threads</p>
        </div>
      </div>

      <div className="slack-card-body">
        {status === 'disconnected' && (
          <div className="slack-status-section">
            <button className="slack-connect-btn" onClick={onConnect}>
              Connect
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="slack-status-section">
            <div className="slack-loading-spinner"></div>
            <p className="slack-status-text">Connecting...</p>
          </div>
        )}

        {status === 'connected' && (
          <div className="slack-status-section">
            <div className="slack-connected-info">
              <div className="slack-status-badge slack-status-connected">
                <span className="slack-status-dot"></span>
                Connected
              </div>
              {workspaceName && (
                <p className="slack-connected-workspace">{workspaceName}</p>
              )}
              {connectedAt && (
                <p className="slack-connected-date">Connected {connectedAt}</p>
              )}
            </div>
            <button className="slack-disconnect-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="slack-status-section">
            <div className="slack-error-message">
              <span className="slack-error-icon">⚠️</span>
              <p>{error || 'An error occurred. Please try again.'}</p>
            </div>
            <button className="slack-connect-btn" onClick={onConnect}>
              Retry Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
