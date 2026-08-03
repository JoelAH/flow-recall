# Project Structure

## Monorepo Organization

```
flow-recall/
├── frontend/          # React UI application
├── backend/           # AWS CDK infrastructure
├── shared/            # (planned) Shared code between frontend/backend
└── package.json       # Root workspace configuration
```

## Frontend Structure

```
frontend/
├── src/
│   ├── App.tsx        # Main application component
│   ├── main.tsx       # React entry point
│   ├── context/       # React contexts (AuthContext)
│   ├── config/        # Configuration files (auth config)
│   ├── assets/        # Static assets (images, icons)
│   ├── *.css          # Component and global styles
│   └── vite-env.d.ts  # Vite type declarations
├── public/            # Public static files
├── index.html         # HTML entry point
├── vite.config.ts     # Vite configuration
├── tsconfig.json      # TypeScript configuration
├── eslint.config.js   # ESLint configuration
└── package.json       # Frontend dependencies
```

## Backend Structure

```
backend/
├── bin/               # CDK app entry point
├── lib/               # CDK stack definitions
│   └── backend-stack.ts  # Main infrastructure stack
├── test/              # Jest tests
├── cdk.json           # CDK configuration
├── tsconfig.json      # TypeScript configuration
├── jest.config.js     # Jest configuration
└── package.json       # Backend dependencies
```

## Key Conventions

- Frontend uses TypeScript with TSX for React components
- Backend uses TypeScript for type safety in infrastructure code
- Each workspace has its own package.json and dependencies
- Tests are co-located with source code in dedicated test/ directories
- CDK stacks are defined in backend/lib/
- Frontend components and styles are in frontend/src/

## Planned Architecture

The backend will implement an event-driven pipeline:
1. S3 ingestion of workplace communications (JSON format)
2. EventBridge triggers for Lambda processing
3. Bedrock for AI-powered analysis and summarization
4. DynamoDB for timeline storage
5. Step Functions for workflow orchestration
6. SES for notification delivery
7. Amplify hosting for the frontend UI
