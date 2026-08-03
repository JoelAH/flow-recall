# Product Overview

FlowRecall is an automated workplace continuity system that helps people catch up after being away. It processes workplace communications (email, chat, calendar) to reconstruct timelines, extract key decisions and actions, and generate prioritized catch-up briefs tailored to different audiences.

## Core Value Proposition

Eliminates hours of manual catch-up work by automatically:
- Reconstructing chronological timelines from workplace noise
- Identifying decisions, actions, deadlines, and ownership
- Generating audience-specific summaries (IC, manager, leadership)
- Highlighting what requires immediate attention

## Target Use Cases

- Returning from vacation
- Joining a project mid-stream
- Taking over work from someone else
- Briefing leadership quickly

## Architecture Approach

Event-driven AWS pipeline using S3 for storage, EventBridge for orchestration, Lambda for processing, Bedrock for AI analysis, DynamoDB for timeline storage, Step Functions for workflow, and Amplify for UI.
