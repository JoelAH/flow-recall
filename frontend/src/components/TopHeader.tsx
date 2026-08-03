import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  createJob, 
  getJobStatus,
  convertDateRangeToISO, 
  validateSearchTopic,
  DataIngestionError,
  JobStatusResponse
} from '../api/dataIngestion';
import './TopHeader.css';

/**
 * DateRangeSelector sub-component
 * Displays date range filter with updated options
 */
function DateRangeSelector() {
  const [dateRange, setDateRange] = useState('last-7-days');
  const [searchText, setSearchText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Job status tracking state
  const [activeJob, setActiveJob] = useState<JobStatusResponse | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  
  // Polling interval reference
  const pollingIntervalRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Poll job status every 2 seconds while PROCESSING
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'PROCESSING') {
      // Stop polling if no active job or job is complete
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Start polling
    const pollStatus = async () => {
      try {
        const status = await getJobStatus(activeJob.jobId);
        setActiveJob(status);

        // Show toast when job completes
        if (status.status === 'DONE') {
          setToastType('success');
          setToastMessage(`Job completed successfully! Retrieved ${status.messageCount || 0} messages.`);
          setShowToast(true);
        } else if (status.status === 'FAILED') {
          setToastType('error');
          setToastMessage(`Job failed: ${status.errorMessage || 'Unknown error'}`);
          setShowToast(true);
        }
      } catch (error) {
        console.error('Failed to poll job status:', error);
        
        if (error instanceof DataIngestionError) {
          if (error.statusCode === 401) {
            // Redirect to login
            setToastType('error');
            setToastMessage('Session expired. Redirecting to login...');
            setShowToast(true);
            setTimeout(() => {
              window.location.href = '/login';
            }, 2000);
            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          } else if (error.statusCode === 404) {
            // Job not found - stop polling
            setToastType('error');
            setToastMessage('Job not found.');
            setShowToast(true);
            setActiveJob(null);
          } else if (error.statusCode === 403) {
            // Ownership mismatch - stop polling
            setToastType('error');
            setToastMessage('You do not have permission to view this job.');
            setShowToast(true);
            setActiveJob(null);
          }
        }
      }
    };

    // Poll immediately
    pollStatus();

    // Set up interval for polling every 2 seconds
    pollingIntervalRef.current = window.setInterval(pollStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [activeJob]);

  // Validate search topic on change
  const handleSearchTextChange = (value: string) => {
    setSearchText(value);
    setValidationError(validateSearchTopic(value));
  };

  const handlePullData = async () => {
    // Validate search topic
    const validationErr = validateSearchTopic(searchText);
    if (validationErr) {
      setValidationError(validationErr);
      return;
    }

    setIsLoading(true);

    try {
      // Convert date range to ISO 8601 format
      const { startDate, endDate } = convertDateRangeToISO(dateRange);

      // Create job request
      const request = {
        startDate,
        endDate,
        ...(searchText.trim() && { searchTopic: searchText.trim() })
      };

      // Call API to create job
      const response = await createJob(request);

      // Store job information and start polling
      setActiveJob(response);

      // Show success toast
      setToastType('success');
      setToastMessage(`Data pull started successfully! Job ID: ${response.jobId}`);
      setShowToast(true);
      
      console.log('Job created:', response);
    } catch (error) {
      console.error('Failed to create job:', error);

      let errorMsg = 'An unexpected error occurred. Please try again.';

      if (error instanceof DataIngestionError) {
        // Handle specific error cases
        if (error.statusCode === 401) {
          // Redirect to login
          errorMsg = 'Session expired. Redirecting to login...';
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
        } else if (error.statusCode === 429) {
          // Concurrent limit error
          errorMsg = 'You have reached the maximum number of concurrent jobs (5). Please wait for a job to complete.';
        } else if (error.statusCode === 400) {
          // Validation error from backend
          errorMsg = error.message;
        } else {
          // Generic error
          errorMsg = error.message;
        }
      }

      // Show error toast
      setToastType('error');
      setToastMessage(errorMsg);
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Dismiss toast notification
  const dismissToast = () => {
    setShowToast(false);
  };

  // Check if button should be disabled
  const isButtonDisabled = isLoading || validationError !== null || (activeJob?.status === 'PROCESSING');

  return (
    <div className="date-range-selector">
      <select 
        className="selector-dropdown" 
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        disabled={isLoading}
      >
        <option value="last-7-days">Last 7 days</option>
        <option value="last-month">Last month</option>
        <option value="last-quarter">Last quarter</option>
        <option value="last-year">Last year</option>
      </select>
      <div className="search-input-container">
        <input
          type="text"
          className="search-input"
          placeholder="Search optional topic"
          value={searchText}
          onChange={(e) => handleSearchTextChange(e.target.value)}
          disabled={isLoading}
        />
        {validationError && (
          <div className="validation-error">{validationError}</div>
        )}
      </div>
      <button 
        className="pull-data-button" 
        onClick={handlePullData}
        disabled={isButtonDisabled}
      >
        {isLoading ? 'Loading...' : 'Pull Data'}
      </button>
      
      {/* Toast notification */}
      {showToast && (
        <div className={`toast-notification ${toastType === 'success' ? 'toast-success' : 'toast-error'}`}>
          <span className="toast-message">{toastMessage}</span>
          <button className="toast-dismiss" onClick={dismissToast}>×</button>
        </div>
      )}
    </div>
  );
}

/**
 * UserMenu sub-component
 * Displays user avatar and email with logout option
 */
function UserMenu() {
  const { user, logout } = useAuth();
  
  // Get user initials for avatar
  const getInitials = (email: string | undefined): string => {
    if (!email) return 'U';
    return email.charAt(0).toUpperCase();
  };

  const displayEmail = user?.email || 'User';
  const initials = getInitials(user?.email);

  return (
    <div className="user-menu">
      <div className="user-avatar">{initials}</div>
      <span className="user-email">{displayEmail}</span>
      <button className="logout-button" onClick={logout}>
        Logout
      </button>
    </div>
  );
}

/**
 * TopHeader component
 * Displays the top header bar with date selector, search, pull data button, and user menu
 */
export function TopHeader() {
  return (
    <header className="top-header">
      <div className="header-center">
        <DateRangeSelector />
      </div>
      <div className="header-right">
        <UserMenu />
      </div>
    </header>
  );
}
