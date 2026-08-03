# Implementation Plan: Dashboard Layout

## Overview

This implementation plan creates the foundational navigation structure for FlowRecall with a persistent left sidebar, top header, and five main pages. The approach follows a bottom-up strategy: first establishing the routing infrastructure, then building reusable layout components, and finally implementing page-specific content with placeholder data. All components use TypeScript with React 19.2.0 and are styled with CSS.

## Tasks

- [x] 1. Install dependencies and set up routing infrastructure
  - Install react-router-dom v7 in frontend workspace
  - Install fast-check for property-based testing
  - Install @testing-library/react and @testing-library/user-event for component testing
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Create Layout component structure
  - [x] 2.1 Create Layout component with three-section structure
    - Create frontend/src/components/Layout.tsx with nav, header, and content areas
    - Use React Router Outlet for child route rendering
    - Create frontend/src/components/Layout.css with grid/flexbox layout
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ]* 2.2 Write property test for Layout component
    - **Property 1: Layout wraps all authenticated pages**
    - **Validates: Requirements 1.2, 6.1, 7.1, 8.1, 9.1, 10.2**
  
  - [ ]* 2.3 Write unit tests for Layout component
    - Test Layout renders all three sections (nav, header, content)
    - Test Layout renders Outlet for child routes
    - _Requirements: 1.1_

- [x] 3. Implement LeftNav component
  - [x] 3.1 Create LeftNav component with navigation items
    - Create frontend/src/components/LeftNav.tsx with nav items array
    - Implement NavItem sub-component with Link from react-router-dom
    - Use useLocation hook to determine active route
    - Display icons (Unicode symbols or simple SVG) and text labels
    - Implement badge display for items with notification counts
    - Create frontend/src/components/LeftNav.css with navigation styling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_
  
  - [ ]* 3.2 Write property test for navigation click behavior
    - **Property 2: Navigation click navigates to correct route**
    - **Validates: Requirements 2.2**
  
  - [ ]* 3.3 Write property test for active route highlighting
    - **Property 3: Active route highlighting matches current route**
    - **Validates: Requirements 2.3**
  
  - [ ]* 3.4 Write property test for navigation item styling consistency
    - **Property 4: Navigation items have consistent styling**
    - **Validates: Requirements 2.4**
  
  - [ ]* 3.5 Write property test for icon and text display
    - **Property 5: Navigation items display icon and text**
    - **Validates: Requirements 2.5**
  
  - [ ]* 3.6 Write property test for badge display
    - **Property 6: Badge display and content**
    - **Validates: Requirements 3.1, 3.3**
  
  - [ ]* 3.7 Write unit tests for LeftNav component
    - Test all navigation items render in correct order
    - Test clicking nav item navigates to correct route
    - Test active route highlights correct nav item
    - Test badge displays for Catch-Up Brief item
    - _Requirements: 2.1, 2.2, 2.3, 3.1_

- [x] 4. Implement TopHeader component
  - [x] 4.1 Create TopHeader component with three sections
    - Create frontend/src/components/TopHeader.tsx with left, center, right sections
    - Display FlowRecall logo on left
    - Create WorkspaceSelector sub-component with placeholder "My Workspace"
    - Create DateRangeSelector sub-component with placeholder "Last 7 days"
    - Create UserMenu sub-component using AuthContext for user data
    - Create frontend/src/components/TopHeader.css with header styling
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ]* 4.2 Write unit tests for TopHeader component
    - Test TopHeader renders logo, selectors, and user menu
    - Test user menu displays user email from AuthContext
    - Test user menu handles missing user data gracefully
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Checkpoint - Ensure layout components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create Dashboard page with detailed placeholder UI
  - [x] 6.1 Create Dashboard page component structure
    - Create frontend/src/pages/Dashboard.tsx with page header and grid layout
    - Implement StatsCards sub-component with 5 cards (Messages, Decisions, Tasks, Risks, CTA)
    - Implement WhatYouMissed sub-component with 3-4 placeholder items
    - Implement RecentTimeline sub-component with 5-6 placeholder events
    - Implement PriorityOverview sub-component with High/Medium/Informational categories
    - Create frontend/src/pages/Dashboard.css with dashboard-specific styling
    - Use hardcoded placeholder data for all sections
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [ ]* 6.2 Write unit tests for Dashboard page
    - Test Dashboard renders page heading and refresh button
    - Test Dashboard renders all sub-components (stats, activity, timeline, sidebar)
    - Test StatsCards renders all 5 cards with placeholder data
    - Test WhatYouMissed renders placeholder items
    - Test RecentTimeline renders placeholder events
    - Test PriorityOverview renders all priority categories
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 7. Create stub pages for Timeline, Catch-Up Brief, Insights, and Integrations
  - [x] 7.1 Create Timeline stub page
    - Create frontend/src/pages/Timeline.tsx with heading and placeholder content
    - Create frontend/src/pages/Timeline.css with stub page styling
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 7.2 Create Catch-Up Brief stub page
    - Create frontend/src/pages/CatchUpBrief.tsx with heading and placeholder content
    - Create frontend/src/pages/CatchUpBrief.css with stub page styling
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 7.3 Create Insights stub page
    - Create frontend/src/pages/Insights.tsx with heading and placeholder content
    - Create frontend/src/pages/Insights.css with stub page styling
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 7.4 Create Integrations stub page
    - Create frontend/src/pages/Integrations.tsx with heading and placeholder content
    - Create frontend/src/pages/Integrations.css with stub page styling
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [ ]* 7.5 Write property test for stub page structure
    - **Property 7: Stub pages have consistent structure**
    - **Validates: Requirements 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2, 9.3**
  
  - [ ]* 7.6 Write unit tests for stub pages
    - Test each stub page renders heading with correct text
    - Test each stub page renders placeholder content
    - _Requirements: 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2, 9.3_

- [x] 8. Update App.tsx with routing configuration
  - [x] 8.1 Configure React Router with nested routes
    - Import BrowserRouter, Routes, Route from react-router-dom
    - Define public routes (Login, Signup, Callback) without Layout
    - Define protected routes wrapped in ProtectedRoute and Layout
    - Create parent route with Layout component and Outlet
    - Create child routes for Dashboard, Timeline, CatchUpBrief, Insights, Integrations
    - Add redirect from root path (/) to /dashboard
    - Add catch-all route (*) redirecting to /dashboard
    - _Requirements: 10.1, 10.2, 10.4, 10.5_
  
  - [ ]* 8.2 Write property test for layout spacing across viewports
    - **Property 8: Layout maintains consistent spacing across viewports**
    - **Validates: Requirements 1.3**
  
  - [ ]* 8.3 Write property test for client-side routing
    - **Property 9: Client-side routing without page reloads**
    - **Validates: Requirements 10.3**
  
  - [ ]* 8.4 Write property test for browser history
    - **Property 10: Browser history maintained**
    - **Validates: Requirements 10.5**
  
  - [ ]* 8.5 Write unit tests for routing configuration
    - Test root path redirects to /dashboard
    - Test invalid routes redirect to /dashboard
    - Test all defined routes render correct page components
    - Test protected routes require authentication
    - Test navigation maintains browser history
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

- [x] 9. Final checkpoint - Ensure all tests pass and navigation works
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check library with minimum 100 iterations
- All components use TypeScript with React 19.2.0
- Styling uses plain CSS files co-located with components
- Placeholder data is hardcoded in components for initial implementation
- Future iterations will replace placeholder data with backend API calls
