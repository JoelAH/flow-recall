# Gmail Client Testing Notes

## Unit Testing Challenges

The `googleapis` library causes memory issues in Jest test environments due to its large dependency tree and complex initialization. Attempting to mock the library results in heap allocation failures even with minimal test cases.

## Testing Strategy

### Manual/Integration Testing Required

The Gmail client should be tested through:

1. **Integration Tests**: Test the client against a real Gmail API test account or using the Gmail API's test environment
2. **End-to-End Tests**: Test as part of the Process Job Lambda function with mocked DynamoDB and real Gmail API calls
3. **Manual Testing**: Verify functionality during development with actual OAuth tokens

### Test Cases to Verify

#### Authentication
- ✓ OAuth2 client initializes with provided tokens
- ✓ Token refresh events are handled correctly
- ✓ Access token and expiration are accessible via getters

#### Search Query Building
- ✓ Date range is formatted correctly (YYYY/MM/DD)
- ✓ Search topic is included in query when provided
- ✓ Query format matches Gmail API requirements

#### Message Fetching
- ✓ Messages are fetched successfully with pagination
- ✓ Empty results are handled correctly
- ✓ Message details are retrieved in full format
- ✓ Pagination continues until all messages are fetched

#### Error Handling
- ✓ 401 errors throw GmailAuthError with "token expired" message
- ✓ 403 errors throw GmailAuthError with "access denied" message
- ✓ 429 errors throw GmailRateLimitError
- ✓ 5xx errors throw generic errors with statusCode
- ✓ Errors are logged with appropriate context

#### Retry Logic
- ✓ Rate limit errors trigger exponential backoff (via retryWithBackoff)
- ✓ Transient errors trigger retry logic (via retryWithBackoff)
- ✓ Non-retryable errors fail immediately

## Code Quality Verification

The implementation has been verified through:
- ✓ TypeScript compilation (no errors)
- ✓ Type safety with googleapis types
- ✓ Proper error handling and logging
- ✓ Integration with existing retry utilities
- ✓ Consistent patterns with other shared utilities

## Future Improvements

Consider these approaches for better testability:
1. Extract an interface for the Gmail API client to enable easier mocking
2. Use dependency injection for the googleapis library
3. Create a thin wrapper around googleapis that can be mocked
4. Use integration tests with a test Gmail account in CI/CD
