# FlowRecall Backend

This is the AWS CDK infrastructure for FlowRecall, built with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Gmail Integration Configuration

The FlowRecall backend includes Gmail OAuth 2.0 integration for accessing user email communications. This requires configuration of Google OAuth credentials.

### Required Configuration

The Gmail integration uses AWS Systems Manager Parameter Store to securely store OAuth credentials:

- **Parameter**: `/flowrecall/gmail-oauth-client-id`
  - Type: SecureString
  - Description: Google OAuth Client ID for Gmail integration

- **Parameter**: `/flowrecall/gmail-oauth-client-secret`
  - Type: SecureString
  - Description: Google OAuth Client Secret for Gmail integration

### OAuth Configuration

- **OAuth Scopes**:
  - `https://www.googleapis.com/auth/gmail.readonly` - Read-only access to Gmail messages
  - `https://www.googleapis.com/auth/gmail.metadata` - Access to message metadata
  - `https://www.googleapis.com/auth/userinfo.email` - User's email address

- **OAuth Redirect URI**: `https://<api-gateway-url>/api/integrations/gmail/callback`
  - The actual redirect URI is output by the CDK stack after deployment
  - This must be configured in Google Cloud Console as an authorized redirect URI

### Setup Instructions

For detailed setup instructions, including:
- Creating OAuth credentials in Google Cloud Console
- Configuring the OAuth consent screen
- Setting up SSM parameters
- Environment-specific configuration
- Security best practices
- Troubleshooting

See the comprehensive guide: [Gmail OAuth Setup Guide](./docs/gmail-oauth-setup.md)

### Quick Setup

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Gmail API
3. Configure the OAuth consent screen with required scopes
4. Store credentials in Parameter Store:

```bash
aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-id" \
  --value "YOUR_GOOGLE_CLIENT_ID" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-secret" \
  --value "YOUR_GOOGLE_CLIENT_SECRET" \
  --type "SecureString"
```

5. Deploy the CDK stack: `npm run cdk:deploy`
6. Note the OAuth callback URL from the stack outputs
7. Add the callback URL to Google Cloud Console authorized redirect URIs

### Verification

After deployment, the CDK stack outputs will include:
- Gmail OAuth callback URL
- Parameter Store paths
- Setup verification instructions
