# Technology Stack

## Project Structure

Monorepo using npm workspaces with three main packages:
- `frontend`: React UI
- `backend`: AWS CDK infrastructure
- `shared`: (planned) shared types and utilities

## Frontend Stack

- React 19.2.0
- TypeScript 5.6.x
- Vite 7.3.1 (build tool and dev server)
- ESLint for linting
- TSX for React components

## Backend Stack

- AWS CDK 2.x (Infrastructure as Code)
- TypeScript 5.6.x
- Node.js 22.x
- Jest for testing
- AWS Services: Lambda, EventBridge, S3, DynamoDB, Bedrock, Step Functions, SES, Amplify

## Node.js Version Requirement

**IMPORTANT**: This project requires Node.js 22.x. Before running any commands (build, dev, test, CDK operations), ensure you're using the correct version:

```bash
nvm use 22
```

If you don't have Node.js 22 installed via nvm:
```bash
nvm install 22
nvm use 22
```

This applies to all operations including:
- Development servers (`npm run dev:*`)
- Building (`npm run build:*`)
- Testing (`npm test`)
- CDK operations (`npm run cdk:*`, `cdk synth`, `cdk deploy`, etc.)

## Common Commands

### Development
```bash
npm run dev:frontend    # Start frontend dev server
npm run dev:backend     # Watch backend TypeScript compilation
```

### Building
```bash
npm run build:frontend  # Build frontend for production
npm run build:backend   # Compile backend TypeScript
npm run build:all       # Build both frontend and backend
```

### Testing
```bash
npm test               # Run tests in all workspaces
```

### Deployment
```bash
npm run deploy         # Build all and deploy CDK stack
```

### CDK Operations (from backend workspace)
```bash
npm run cdk:deploy     # Deploy all CDK stacks
npm run cdk:destroy    # Destroy all CDK stacks
npm run cdk:diff       # Show infrastructure changes
npm run cdk:synth      # Synthesize CloudFormation templates
```

## Build System

- Root package.json orchestrates workspace commands
- Frontend uses Vite for fast HMR and optimized builds
- Backend uses TypeScript compiler (tsc) with watch mode
- CDK handles AWS infrastructure deployment
