# Deployment Scripts

This directory contains deployment validation and testing scripts for the Bedrock Message Analysis feature.

## Scripts

### pre-deploy-validation.js

Pre-deployment validation script that checks all prerequisites before CDK deployment.

**Usage:**
```bash
npm run validate:deployment
# or directly
node scripts/pre-deploy-validation.js
```

**Checks:**
- ✅ Node.js 22.x is installed
- ✅ AWS credentials are configured and valid
- ✅ CDK bootstrap status (informational)
- ✅ Lambda functions are built (TypeScript compiled to JavaScript)
- ⚠️ Bedrock model access reminder (informational)

**Exit codes:**
- `0` - All checks passed, ready to deploy
- `1` - One or more checks failed, fix issues before deploying

### post-deploy-smoke-tests.js

Post-deployment smoke tests that verify infrastructure is deployed correctly.

**Usage:**
```bash
npm run smoke:test
# or directly
node scripts/post-deploy-smoke-tests.js
```

**Tests:**
- ✅ CloudFormation stack exists and is in valid state
- ✅ Analysis DynamoDB table is ACTIVE with correct GSIs
- ✅ Messages DynamoDB table is ACTIVE
- ✅ Message_Analyzer Lambda function exists and is configured correctly
- ✅ Timeline_Generator Lambda function exists and is configured correctly

**Exit codes:**
- `0` - All smoke tests passed
- `1` - One or more tests failed

**Environment variables:**
- `CDK_STACK_NAME` - Override default stack name (default: `BackendStack`)

## Automated Deployment Workflow

The `deploy:analysis` npm script automatically runs these scripts:

```bash
npm run deploy:analysis
```

This executes:
1. **Pre-hook** (`predeploy:analysis`): Runs `pre-deploy-validation.js`
2. **Build**: Compiles TypeScript Lambda functions
3. **Deploy**: Runs `npx cdk deploy --all`
4. **Post-hook** (`postdeploy:analysis`): Runs `post-deploy-smoke-tests.js`

If any step fails, the deployment stops and reports the error.

## Manual Workflow

For more control, run each step manually:

```bash
# 1. Validate prerequisites
npm run validate:deployment

# 2. Build Lambda functions
npm run build

# 3. Deploy CDK stack
npx cdk deploy --all

# 4. Run smoke tests
npm run smoke:test
```

## Troubleshooting

### "Node.js version incorrect"

**Solution:**
```bash
nvm use 22
npm run validate:deployment
```

### "AWS credentials not configured"

**Solution:**
```bash
aws configure
# or
export AWS_PROFILE=your-profile-name
npm run validate:deployment
```

### "Lambda functions not built"

**Solution:**
```bash
npm run build
npm run validate:deployment
```

### "Table not found" in smoke tests

**Cause**: Deployment may have failed or table name mismatch

**Solution:**
1. Check CloudFormation console for stack status
2. Verify stack outputs contain table names
3. Redeploy if necessary: `npm run deploy:analysis`

### "Function not found" in smoke tests

**Cause**: Lambda function names not found in stack outputs

**Solution:**
1. Check CDK stack exports Lambda function names as outputs
2. Update stack to export function names
3. Redeploy: `npm run deploy:analysis`

## Adding Custom Checks

To add custom validation checks, edit the scripts:

**Pre-deployment validation:**
```javascript
// In pre-deploy-validation.js
function checkCustomRequirement() {
  log('\n🔍 Checking custom requirement...', colors.blue);
  
  // Your validation logic here
  
  if (valid) {
    log('✅ Custom check passed', colors.green);
    return true;
  } else {
    log('❌ Custom check failed', colors.red);
    return false;
  }
}

// Add to checks array in main()
const checks = [
  checkNodeVersion(),
  checkAWSCredentials(),
  checkBuildStatus(),
  checkCustomRequirement(), // Add here
];
```

**Post-deployment smoke tests:**
```javascript
// In post-deploy-smoke-tests.js
async function checkCustomResource() {
  log('\n🔍 Checking custom resource...', colors.blue);
  
  // Your test logic here
  
  if (valid) {
    log('✅ Custom resource exists', colors.green);
    return true;
  } else {
    log('❌ Custom resource not found', colors.red);
    return false;
  }
}

// Add to checks array in main()
checks.push(await checkCustomResource());
```

## CI/CD Integration

These scripts are designed to work in CI/CD pipelines:

**GitHub Actions example:**
```yaml
- name: Validate deployment prerequisites
  run: npm run validate:deployment
  working-directory: backend

- name: Deploy to AWS
  run: npm run deploy:analysis
  working-directory: backend
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    AWS_REGION: us-east-1
```

**GitLab CI example:**
```yaml
deploy:
  script:
    - cd backend
    - npm run validate:deployment
    - npm run deploy:analysis
  only:
    - main
```

## Related Documentation

- [Deployment Guide](../docs/bedrock-analysis-deployment-guide.md)
- [Bedrock Model Access Setup](../docs/bedrock-model-access-setup.md)
- [Requirements Document](../.kiro/specs/bedrock-message-analysis/requirements.md)
- [Design Document](../.kiro/specs/bedrock-message-analysis/design.md)
