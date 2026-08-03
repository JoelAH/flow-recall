/**
 * Validation utilities for data ingestion pipeline
 * Validates date ranges, search topics, and other input parameters
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that a string is a valid ISO 8601 date format
 */
export function validateISO8601Date(dateStr: string): ValidationResult {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
  
  if (!iso8601Regex.test(dateStr)) {
    return {
      isValid: false,
      error: 'Date must be in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)',
    };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      error: 'Invalid date value',
    };
  }

  return { isValid: true };
}

/**
 * Validates that startDate is before or equal to endDate
 */
export function validateDateRange(startDate: string, endDate: string): ValidationResult {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    return {
      isValid: false,
      error: 'startDate must be before or equal to endDate',
    };
  }

  return { isValid: true };
}

/**
 * Validates that the date range does not exceed 365 days
 */
export function validateDateRangeLimit(startDate: string, endDate: string): ValidationResult {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > 365) {
    return {
      isValid: false,
      error: 'Date range cannot exceed 365 days',
    };
  }

  return { isValid: true };
}

/**
 * Validates search topic length (1-500 characters)
 */
export function validateSearchTopic(searchTopic: string): ValidationResult {
  if (searchTopic.length < 1 || searchTopic.length > 500) {
    return {
      isValid: false,
      error: 'Search topic must be between 1 and 500 characters',
    };
  }

  return { isValid: true };
}

/**
 * Validates all date-related parameters for a data pull request
 */
export function validateDataPullRequest(
  startDate: string,
  endDate: string,
  searchTopic?: string
): ValidationResult {
  // Validate ISO 8601 format for both dates
  const startDateValidation = validateISO8601Date(startDate);
  if (!startDateValidation.isValid) {
    return startDateValidation;
  }

  const endDateValidation = validateISO8601Date(endDate);
  if (!endDateValidation.isValid) {
    return endDateValidation;
  }

  // Validate date range order
  const rangeValidation = validateDateRange(startDate, endDate);
  if (!rangeValidation.isValid) {
    return rangeValidation;
  }

  // Validate date range limit
  const limitValidation = validateDateRangeLimit(startDate, endDate);
  if (!limitValidation.isValid) {
    return limitValidation;
  }

  // Validate search topic if provided
  if (searchTopic !== undefined) {
    const topicValidation = validateSearchTopic(searchTopic);
    if (!topicValidation.isValid) {
      return topicValidation;
    }
  }

  return { isValid: true };
}
