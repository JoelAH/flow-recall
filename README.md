# FlowRecall

FlowRecall automatically rebuilds what happened while you were away, explains it in the right context for you, and tells you exactly what to do next — without reading hundreds of emails or messages.

It reconstructs timelines from workplace communications, generates a prioritized catch-up brief, and rewrites updates for different audiences (you, your manager, or leadership). Instead of people wasting hours catching up, FlowRecall turns workplace noise into clear, actionable continuity.

## What the Project Is About

Modern workplaces generate massive amounts of communication across email, chat, and calendars. When someone:

- Returns from vacation
- Joins a project late
- Takes over work from someone else
- Needs to brief leadership quickly

They spend hours doing boring, repetitive work:

- Reading long email threads
- Reconstructing timelines
- Figuring out what decisions were made
- Rewriting the same information for different audiences

FlowRecall automates this entire process.

## Architecture

FlowRecall is built as an AWS event-driven pipeline that ingests workplace communications (email, chat, calendar) stored in S3 as JSON. EventBridge triggers Lambda functions to normalize these inputs into a unified event format. We then use Amazon Bedrock to extract key actions, decisions, deadlines, and ownership from the data, and reconstruct a chronological timeline of events.

The timeline is stored in DynamoDB and used to generate a prioritized catch-up brief for a returning user, identifying tasks assigned to them, decisions made in their absence, and urgent deadlines. A second Bedrock pass rewrites the brief into audience-specific summaries (individual contributor, manager, leadership). Outputs are stored in S3 and delivered via Amazon SES notifications. AWS Step Functions orchestrates the full workflow, and a simple Amplify UI displays the timeline and briefs.

### Gmail Integration

FlowRecall includes secure Gmail OAuth 2.0 integration, allowing users to connect their Gmail accounts to access email communications for timeline reconstruction. The integration features:

- Secure OAuth 2.0 flow with CSRF protection
- Encrypted token storage using AWS KMS
- Automatic token refresh for seamless user experience
- Read-only access to Gmail messages and metadata

For setup instructions, see [backend/docs/gmail-oauth-setup.md](backend/docs/gmail-oauth-setup.md).

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: AWS CDK, TypeScript
- **AWS Services**: Lambda, EventBridge, S3, DynamoDB, Bedrock, Step Functions, SES, Amplify

## Project Structure

This is a monorepo using npm workspaces:

```
flow-recall/
├── frontend/          # React UI application
├── backend/           # AWS CDK infrastructure
├── shared/            # (planned) Shared types and utilities
└── package.json       # Root workspace configuration
```

## Getting Started

### Prerequisites

- Node.js 22.x or later
- npm
- AWS CLI configured with appropriate credentials
- AWS CDK CLI (`npm install -g aws-cdk`)

### Installation

```bash
# Install dependencies for all workspaces
npm install
```

### Development

```bash
# Start frontend dev server
npm run dev:frontend

# Watch backend TypeScript compilation
npm run dev:backend
```

### Building

```bash
# Build frontend for production
npm run build:frontend

# Compile backend TypeScript
npm run build:backend

# Build both frontend and backend
npm run build:all
```

### Testing

```bash
# Run tests in all workspaces
npm test
```

### Deployment

```bash
# Build all and deploy CDK stack
npm run deploy
```

### CDK Operations

```bash
# Deploy all CDK stacks
npm run cdk:deploy --workspace=backend

# Destroy all CDK stacks
npm run cdk:destroy --workspace=backend

# Show infrastructure changes
npm run cdk:diff --workspace=backend

# Synthesize CloudFormation templates
npm run cdk:synth --workspace=backend
```

## License

ISC