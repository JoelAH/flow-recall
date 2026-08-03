/**
 * AWS Cognito Authentication Configuration
 * 
 * IMPORTANT: Replace these placeholder values after deploying the backend CDK stack.
 * 
 * To get the actual values:
 * 1. Deploy the AuthStack: `cd backend && npm run cdk:deploy AuthStack`
 * 2. Copy the CloudFormation outputs for:
 *    - UserPoolId
 *    - UserPoolClientId
 *    - UserPoolDomain
 * 3. Replace the placeholder values below
 * 
 * Example values after deployment:
 * - userPoolId: "us-east-1_ABC123DEF"
 * - userPoolClientId: "1a2b3c4d5e6f7g8h9i0j1k2l3m"
 * - cognitoDomain: "flowrecall-auth-dev.auth.us-east-1.amazoncognito.com"
 */

export interface AuthConfig {
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomain: string;
  redirectUri: string;
  logoutUri: string;
}

export const authConfig: AuthConfig = {
  // AWS Cognito User Pool ID (from AuthStack CloudFormation output)
  userPoolId: 'us-east-1_rLSLG7hJp',
  
  // AWS Cognito User Pool Client ID (from AuthStack CloudFormation output)
  userPoolClientId: '1127qq3pklihe34m6ljif6pm2d',
  
  // Cognito domain for hosted UI (from AuthStack CloudFormation output)
  // Format: {domain-prefix}.auth.{region}.amazoncognito.com
  cognitoDomain: 'flowrecall-auth-dev.auth.us-east-1.amazoncognito.com',
  
  // OAuth redirect URI - where Cognito redirects after successful authentication
  // This should match the callback URL configured in the Cognito User Pool Client
  redirectUri: window.location.origin + '/callback',
  
  // Logout redirect URI - where Cognito redirects after logout
  // This should match the logout URL configured in the Cognito User Pool Client
  logoutUri: window.location.origin + '/login'
};
