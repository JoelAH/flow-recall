# Gmail OAuth Setup Guide

This document describes how to configure Google OAuth credentials for the Gmail integration feature.

## Required OAuth Scopes

The Gmail integration requires the following OAuth 2.0 scopes:

1. **`https://www.googleapis.com/auth/gmail.readonly`**
   - Purpose: Read-only access to Gmail messages
   - Allows: Reading email content, headers, and attachments
   - Does NOT allow: Sending, modifying, or deleting emails

2. **`https://www.googleapis.com/auth/gmail.metadata`**
   - Purpose: Access to message metadata
   - Allows: Reading message IDs, thread IDs, labels, and timestamps
   - Does NOT allow: Reading message content

3. **`https://www.googleapis.com/auth/userinfo.email`**
   - Purpose: Access to user's email address
   - Allows: Identifying which Gmail account is connected
   - Used for: Displaying connected email in the UI

## Google Cloud Console Setup

### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project for FlowRecall
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application** as the application type
6. Configure the OAuth client:
   - **Name**: FlowRecall Gmail Integration
   - **Authorized JavaScript origins**: 
     - `http://localhost:5173` (development)
     - `https://app.flowrecall.com` (production)
   - **Authorized redirect URIs**:
     - `https://<api-gateway-url>/api/integrations/gmail/callback` (production)
     - `http://localhost:3000/api/integrations/gmail/callback` (local testing)
7. Click **Create**
8. Save the **Client ID** and **Client Secret**

### 2. Enable Gmail API

1. In Google Cloud Console, navigate to **APIs & Services** > **Library**
2. Search for "Gmail API"
3. Click **Enable**

### 3. Configure OAuth Consent Screen

1. Navigate to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type (or **Internal** if using Google Workspace)
3. Fill in application information:
   - **App name**: FlowRecall
   - **User support email**: Your support email
   - **Developer contact information**: Your contact email
4. Add the required scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.metadata`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Add test users (if in testing mode)
6. Save and continue

## AWS Systems Manager Parameter Store Configuration

After deploying the CDK stack, create the SSM parameters with your Google OAuth credentials:

### Using AWS CLI

```bash
# Create Client ID parameter (SecureString with encryption)
aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-id" \
  --value "YOUR_GOOGLE_CLIENT_ID" \
  --type "SecureString" \
  --description "Google OAuth Client ID for Gmail integration"

# Create Client Secret parameter (SecureString with encryption)
aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-secret" \
  --value "YOUR_GOOGLE_CLIENT_SECRET" \
  --type "SecureString" \
  --description "Google OAuth Client Secret for Gmail integration"
```

### Using AWS Console

1. Go to AWS Systems Manager console
2. Navigate to **Parameter Store**
3. Click **Create parameter**
4. For Client ID:
   - **Name**: `/flowrecall/gmail-oauth-client-id`
   - **Description**: Google OAuth Client ID for Gmail integration
   - **Type**: SecureString
   - **KMS key source**: My current account (uses default aws/ssm key)
   - **Value**: YOUR_GOOGLE_CLIENT_ID
   - Click **Create parameter**
5. Repeat for Client Secret:
   - **Name**: `/flowrecall/gmail-oauth-client-secret`
   - **Description**: Google OAuth Client Secret for Gmail integration
   - **Type**: SecureString
   - **KMS key source**: My current account (uses default aws/ssm key)
   - **Value**: YOUR_GOOGLE_CLIENT_SECRET
   - Click **Create parameter**

## Environment-Specific Configuration

### Development

For local development, you may want to use a separate OAuth client with localhost redirect URIs. Create separate parameters or use the same parameters with development credentials:

```bash
aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-id" \
  --value "DEV_CLIENT_ID" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-secret" \
  --value "DEV_CLIENT_SECRET" \
  --type "SecureString"
```

### Production

For production, update the parameters with production OAuth client credentials:

```bash
aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-id" \
  --value "PROD_CLIENT_ID" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --name "/flowrecall/gmail-oauth-client-secret" \
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
   - Development, staging, and production should have separate OAuth clients
   - This allows independent rotation and revocation

4. **Monitor OAuth usage**
   - Set up Google Cloud Console alerts for unusual API usage
   - Review OAuth consent grants regularly

5. **Limit scope access**
   - Only request the minimum required scopes
   - Never request write or send permissions unless absolutely necessary

6. **Use SecureString type**
   - Always use SecureString type for sensitive parameters
   - Parameters are encrypted at rest using AWS KMS

## Verification

After configuration, verify the setup:

1. Deploy the CDK stack: `npm run cdk:deploy`
2. Check that the parameters exist:
   ```bash
   aws ssm get-parameter --name "/flowrecall/gmail-oauth-client-id" --with-decryption
   aws ssm get-parameter --name "/flowrecall/gmail-oauth-client-secret" --with-decryption
   ```
3. Test the OAuth flow by connecting Gmail in the FlowRecall UI
4. Verify that tokens are encrypted and stored in DynamoDB

## Troubleshooting

### "redirect_uri_mismatch" Error

- Ensure the redirect URI in your application exactly matches one of the authorized redirect URIs in Google Cloud Console
- Check for trailing slashes or protocol mismatches (http vs https)

### "invalid_client" Error

- Verify the Client ID and Client Secret are correct in Parameter Store
- Ensure the OAuth client is enabled in Google Cloud Console

### "access_denied" Error

- User cancelled the OAuth flow or denied permissions
- Check that all required scopes are configured in the OAuth consent screen

### "invalid_grant" Error

- Refresh token has expired or been revoked
- User needs to reconnect their Gmail account

### Parameter Not Found Error

- Ensure parameters are created in the correct AWS region
- Verify parameter names match exactly: `/flowrecall/gmail-oauth-client-id` and `/flowrecall/gmail-oauth-client-secret`
- Check that Lambda functions have SSM read permissions
