# Slack OAuth Setup Guide

This document describes how to configure Slack OAuth credentials for the Slack integration feature.

## Required OAuth Scopes

The Slack integration requires the following OAuth 2.0 scopes:

1. **`channels:history`**
   - Purpose: Read messages from public channels
   - Allows: Reading message content, threads, and reactions from public channels

2. **`groups:history`**
   - Purpose: Read messages from private channels
   - Allows: Reading message content from private channels the user has access to

3. **`im:history`**
   - Purpose: Read direct messages
   - Allows: Reading direct message conversations

4. **`mpim:history`**
   - Purpose: Read multi-party direct messages
   - Allows: Reading group direct message conversations

5. **`users:read`**
   - Purpose: Identify the connected user
   - Allows: Reading user profile information

6. **`team:read`**
   - Purpose: Identify the workspace
   - Allows: Reading workspace information

7. **`channels:read`**
   - Purpose: List available public channels
   - Allows: Viewing channel names and metadata

8. **`groups:read`**
   - Purpose: List available private channels
   - Allows: Viewing private channel names the user has access to

## Slack App Configuration

### 1. Create a Slack App

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Click **Create New App**
3. Select **From scratch**
4. Configure the app:
   - **App Name**: FlowRecall
   - **Development Workspace**: Select your workspace
5. Click **Create App**

### 2. Configure OAuth & Permissions

1. In your app settings, navigate to **OAuth & Permissions**
2. Scroll to **Redirect URLs** and add:
   - `https://<api-gateway-url>/api/integrations/slack/callback` (production)
   - `http://localhost:3000/api/integrations/slack/callback` (local testing)
3. Click **Add** and **Save URLs**
4. Scroll to **Scopes** section
5. Under **User Token Scopes**, add all required scopes:
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
   - `users:read`
   - `team:read`
   - `channels:read`
   - `groups:read`
6. Save changes

### 3. Get OAuth Credentials

1. Navigate to **Basic Information** in your app settings
2. Scroll to **App Credentials**
3. Copy the **Client ID**
4. Click **Show** next to **Client Secret** and copy it
5. Keep these credentials secure - you'll add them to Parameter Store

### 4. Install App to Workspace (Optional for Testing)

1. Navigate to **OAuth & Permissions**
2. Click **Install to Workspace**
3. Review the permissions and click **Allow**
4. This generates a test token you can use for development

## AWS Systems Manager Parameter Store Configuration

After deploying the CDK stack, create the SSM parameters with your Slack OAuth credentials:

### Using AWS CLI

```bash
# Create Client ID parameter (SecureString with encryption)
aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-id" \
  --value "YOUR_SLACK_CLIENT_ID" \
  --type "SecureString" \
  --description "Slack OAuth Client ID for Slack integration"

# Create Client Secret parameter (SecureString with encryption)
aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-secret" \
  --value "YOUR_SLACK_CLIENT_SECRET" \
  --type "SecureString" \
  --description "Slack OAuth Client Secret for Slack integration"
```

### Using AWS Console

1. Go to AWS Systems Manager console
2. Navigate to **Parameter Store**
3. Click **Create parameter**
4. For Client ID:
   - **Name**: `/flowrecall/slack-oauth-client-id`
   - **Description**: Slack OAuth Client ID for Slack integration
   - **Type**: SecureString
   - **KMS key source**: My current account (uses default aws/ssm key)
   - **Value**: YOUR_SLACK_CLIENT_ID
   - Click **Create parameter**
5. Repeat for Client Secret:
   - **Name**: `/flowrecall/slack-oauth-client-secret`
   - **Description**: Slack OAuth Client Secret for Slack integration
   - **Type**: SecureString
   - **KMS key source**: My current account (uses default aws/ssm key)
   - **Value**: YOUR_SLACK_CLIENT_SECRET
   - Click **Create parameter**

## Environment-Specific Configuration

### Development

For local development, you may want to use a separate Slack app with localhost redirect URIs. Create separate parameters or use the same parameters with development credentials:

```bash
aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-id" \
  --value "DEV_CLIENT_ID" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-secret" \
  --value "DEV_CLIENT_SECRET" \
  --type "SecureString"
```

### Production

For production, update the parameters with production OAuth client credentials:

```bash
aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-id" \
  --value "PROD_CLIENT_ID" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-secret" \
  --value "PROD_CLIENT_SECRET" \
  --type "SecureString" \
  --overwrite
```

## Security Best Practices

1. **Never commit credentials to version control**
   - OAuth credentials should only exist in Parameter Store
   - Use placeholder values in CDK code

2. **Rotate credentials periodically**
   - Generate new OAuth client credentials every 90 days
   - Update Parameter Store with new values using `--overwrite` flag
   - Old credentials can be revoked after rotation

3. **Use separate credentials per environment**
   - Development, staging, and production should have separate Slack apps
   - This allows independent rotation and revocation

4. **Monitor OAuth usage**
   - Review Slack app analytics regularly
   - Set up alerts for unusual API usage

5. **Limit scope access**
   - Only request the minimum required scopes
   - Never request write or admin permissions unless absolutely necessary

6. **Use SecureString type**
   - Always use SecureString type for sensitive parameters
   - Parameters are encrypted at rest using AWS KMS

## Verification

After configuration, verify the setup:

1. Deploy the CDK stack: `npm run cdk:deploy`
2. Check that the parameters exist:
   ```bash
   aws ssm get-parameter --name "/flowrecall/slack-oauth-client-id" --with-decryption
   aws ssm get-parameter --name "/flowrecall/slack-oauth-client-secret" --with-decryption
   ```
3. Test the OAuth flow by connecting Slack in the FlowRecall UI
4. Verify that tokens are encrypted and stored in DynamoDB

## Troubleshooting

### "invalid_redirect_uri" Error

- Ensure the redirect URI in your application exactly matches one of the authorized redirect URIs in Slack app settings
- Check for trailing slashes or protocol mismatches (http vs https)

### "invalid_client_id" or "invalid_client" Error

- Verify the Client ID and Client Secret are correct in Parameter Store
- Ensure the Slack app is not deleted or suspended

### "access_denied" Error

- User cancelled the OAuth flow or denied permissions
- Check that all required scopes are configured in the Slack app

### "invalid_code" Error

- Authorization code has expired (codes expire after 10 minutes)
- User needs to restart the OAuth flow

### "token_revoked" Error

- User has revoked the app's access from their Slack workspace
- User needs to reconnect their Slack account

### Parameter Not Found Error

- Ensure parameters are created in the correct AWS region
- Verify parameter names match exactly: `/flowrecall/slack-oauth-client-id` and `/flowrecall/slack-oauth-client-secret`
- Check that Lambda functions have SSM read permissions

## Slack App Distribution (Optional)

If you want to distribute FlowRecall to other Slack workspaces:

1. Navigate to **Manage Distribution** in your app settings
2. Complete the checklist:
   - Add app icon and description
   - Configure privacy policy and support URLs
   - Review and accept Slack's terms
3. Click **Activate Public Distribution**
4. Share your app's installation URL with users

Note: Public distribution requires Slack's approval for apps requesting sensitive scopes.
