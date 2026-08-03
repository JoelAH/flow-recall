# Slack Client Testing Notes

## Testing Strategy

### Manual/Integration Testing Required

The Slack client should be tested through:

1. **Integration Tests**: Test the client against a real Slack API test workspace or using Slack's test environment
2. **End-to-End Tests**: Test as part of the Process Job Lambda function with mocked DynamoDB and real Slack API calls
3. **Manual Testing**: Verify functionality during development with actual OAuth tokens

### Test Cases to Verify

#### Authentication
- ✓ Client initializes with provided tokens
- ✓ Access token is accessible via getter
- ✓ Token expiration timestamp is accessible
- ✓ Workspace information is accessible

#### Search Query Building
- ✓ Date range is formatted correctly (YYYY-MM-DD)
- ✓ Search topic is included in query when provided
- ✓ Query format matches Slack API requirements

#### Message Fetching
- ✓ Messages are fetched successfully with pagination
- ✓ Empty results are handled correctly
- ✓ Pagination continues until all pages are fetched
- ✓ Page count is respected

#### Error Handling
- ✓ `invalid_auth` errors throw SlackAuthError
- ✓ `not_authed` errors throw SlackAuthError
- ✓ `token_expired` errors throw SlackAuthError
- ✓ `rate_limited` errors throw SlackRateLimitError
- ✓ HTTP 429 status throws SlackRateLimitError with Retry-After header
- ✓ Errors are logged with appropriate context

#### Retry Logic
- ✓ Rate limit errors trigger exponential backoff (via retryWithBackoff)
- ✓ Transient errors trigger retry logic (via retryWithBackoff)
- ✓ Non-retryable errors fail immediately
- ✓ Retry-After header is respected when available

## Code Quality Verification

The implementation has been verified through:
- ✓ TypeScript compilation (no errors)
- ✓ Type safety with Slack API response types
- ✓ Proper error handling and logging
- ✓ Integration with existing retry utilities
- ✓ Consistent patterns with Gmail client implementation

## Implementation Details

### Key Features
- Uses native `fetch` API for HTTP requests
- Handles Slack-specific error codes (`invalid_auth`, `not_authed`, `rate_limited`)
- Respects `Retry-After` header for rate limiting
- Supports pagination through page numbers
- Formats dates in Slack's expected format (YYYY-MM-DD)
- Includes workspace and user information from tokens

### Error Types
- `SlackAuthError`: Authentication failures (invalid/expired tokens)
- `SlackRateLimitError`: Rate limit exceeded (includes optional retryAfter)

### API Endpoint
- Uses `search.messages` endpoint with query parameters
- Maximum 100 messages per page (Slack API limit)
- Pagination via page numbers (not cursors)

## Future Improvements

Consider these approaches for better testability:
1. Extract an interface for the HTTP client to enable easier mocking
2. Use dependency injection for the fetch function
3. Create integration tests with a test Slack workspace in CI/CD
4. Add property-based tests for query building logic
