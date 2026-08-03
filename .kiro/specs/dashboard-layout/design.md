# Design Document: Dashboard Layout

## Overview

The dashboard layout system provides the foundational navigation structure for the FlowRecall application. This design implements a standard web application layout pattern with a persistent left navigation sidebar, top header bar, and dynamic content area. The layout wraps all authenticated pages and provides consistent navigation, user context display, and visual hierarchy.

This initial implementation focuses on establishing the structural foundation with placeholder content. The design prioritizes:
- Clean separation between layout chrome and page content
- Reusable Layout component that wraps all authenticated routes
- Client-side routing with React Router for smooth navigation
- Responsive layout structure that adapts to viewport changes
- Placeholder UI that demonstrates the intended data presentation patterns

The five main application pages (Dashboard, Timeline, Catch-Up Brief, Insights, Integrations) are implemented as route-based components with placeholder content, establishing the navigation structure for future feature development.

## Architecture

### Component Hierarchy

```
App (Router)
├── Public Routes (Login, Signup, Callback)
└── Protected Routes (wrapped in ProtectedRoute)
    └── Layout
        ├── LeftNav
        │   └── NavItem[]
        ├── TopHeader
        │   ├── Logo
        │   ├── WorkspaceSelector
        │   ├── DateRangeSelector
        │   └── UserMenu
        └── Page Content (Outlet)
            ├── Dashboard
            │   ├── StatsCards
            │   ├── WhatYouMissed
            │   ├── RecentTimeline
            │   └── PriorityOverview
            ├── Timeline
            ├── CatchUpBrief
            ├── Insights
            └── Integrations
```

### Routing Strategy

The application uses React Router v7 with a nested route structure:

1. **Public Routes**: Login, Signup, Callback (no layout wrapper)
2. **Protected Routes**: All application pages wrapped in ProtectedRoute + Layout
3. **Layout Route**: Parent route that renders Layout component with Outlet for child routes
4. **Page Routes**: Child routes that render into the Layout's Outlet

This approach ensures:
- Layout component renders once and persists across navigation
- Only page content re-renders when navigating between pages
- Authentication check happens at the protected route boundary
- Clean separation between authenticated and unauthenticated experiences

### State Management

This feature uses minimal state management:

- **React Router**: Manages current route and navigation state
- **AuthContext**: Provides user authentication state (already exists)
- **Component State**: Local state for UI interactions (e.g., mobile menu toggle)

No global state management library is needed for this feature. Future features may introduce state management for data fetching and caching.

### Layout Dimensions

The layout uses a fixed-fluid hybrid approach:

- **Left Navigation**: Fixed width (240px) with fixed positioning
- **Top Header**: Full width, fixed height (64px), positioned above content
- **Main Content**: Fluid width, fills remaining space with padding
- **Responsive Breakpoint**: Mobile (<768px) collapses nav to hamburger menu

## Components and Interfaces

### Layout Component

**Purpose**: Wraps all authenticated pages with navigation and header chrome.

**Props**: None (uses React Router Outlet for child routes)

**Structure**:
```typescript
interface LayoutProps {
  // No props - uses Outlet for child routes
}

export function Layout(): JSX.Element {
  return (
    <div className="layout">
      <LeftNav />
      <div className="layout-main">
        <TopHeader />
        <main className="layout-content">
          <Outlet /> {/* Child routes render here */}
        </main>
      </div>
    </div>
  )
}
```

**Styling Approach**:
- CSS Grid or Flexbox for layout structure
- Fixed positioning for left nav
- Sticky positioning for top header
- Scrollable content area

### LeftNav Component

**Purpose**: Displays navigation menu with route links and active state highlighting.

**Props**: None (reads current route from React Router)

**Structure**:
```typescript
interface NavItem {
  path: string
  label: string
  icon: string // Icon identifier (e.g., 'dashboard', 'timeline')
  badge?: number // Optional notification count
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/timeline', label: 'Timeline', icon: 'timeline' },
  { path: '/catch-up-brief', label: 'Catch-Up Brief', icon: 'brief', badge: 3 },
  { path: '/insights', label: 'Insights', icon: 'insights' },
  { path: '/integrations', label: 'Integrations', icon: 'integrations' }
]

export function LeftNav(): JSX.Element {
  const location = useLocation()
  
  return (
    <nav className="left-nav">
      <div className="nav-brand">FlowRecall</div>
      <ul className="nav-items">
        {navItems.map(item => (
          <NavItem 
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
          />
        ))}
      </ul>
    </nav>
  )
}
```

**Icon Strategy**: 
- Use simple SVG icons or Unicode symbols for initial implementation
- Icons can be replaced with icon library (e.g., Lucide, Heroicons) in future iteration
- Each icon should be 20x20px with consistent stroke width

### TopHeader Component

**Purpose**: Displays branding, workspace context, and user information.

**Props**: None (reads user from AuthContext)

**Structure**:
```typescript
export function TopHeader(): JSX.Element {
  const { user } = useAuth()
  
  return (
    <header className="top-header">
      <div className="header-left">
        <span className="header-logo">FlowRecall</span>
      </div>
      <div className="header-center">
        <WorkspaceSelector />
        <DateRangeSelector />
      </div>
      <div className="header-right">
        <UserMenu user={user} />
      </div>
    </header>
  )
}
```

**Sub-components**:
- **WorkspaceSelector**: Dropdown showing "My Workspace" (placeholder)
- **DateRangeSelector**: Dropdown showing "Last 7 days" (placeholder)
- **UserMenu**: Avatar + name with dropdown for logout

### Dashboard Page Component

**Purpose**: Main landing page with overview statistics and activity feed.

**Props**: None

**Structure**:
```typescript
export function Dashboard(): JSX.Element {
  return (
    <div className="page-dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <button className="btn-refresh">Refresh Data</button>
      </div>
      
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <StatsCards />
          <WhatYouMissed />
          <RecentTimeline />
        </div>
        <aside className="dashboard-sidebar">
          <PriorityOverview />
        </aside>
      </div>
    </div>
  )
}
```

**Sub-components**:

1. **StatsCards**: Grid of 5 cards showing metrics
   - Messages (142)
   - Decisions (8)
   - Tasks (23)
   - Potential Risks (2)
   - View Catch-Up Brief (CTA card)

2. **WhatYouMissed**: List of recent items requiring attention
   - Each item shows: icon, title, timestamp, priority badge
   - Placeholder: 3-4 items with varied content

3. **RecentTimeline**: Chronological list of recent events
   - Each item shows: timestamp, event type, description
   - Placeholder: 5-6 items spanning recent days

4. **PriorityOverview**: Sidebar showing priority breakdown
   - High Priority: count + list of items
   - Medium Priority: count + list of items
   - Informational: count + list of items

### Page Stub Components

**Purpose**: Placeholder pages for Timeline, Catch-Up Brief, Insights, and Integrations.

**Structure** (same for all):
```typescript
export function Timeline(): JSX.Element {
  return (
    <div className="page-stub">
      <h1>Timeline</h1>
      <div className="stub-content">
        <p>This page is under development.</p>
        <p>The timeline view will display chronological events from your workplace communications.</p>
      </div>
    </div>
  )
}
```

Each stub page includes:
- Page heading matching the navigation label
- Brief description of the planned functionality
- Consistent styling with placeholder content

## Data Models

### Navigation Item

```typescript
interface NavItem {
  path: string        // Route path (e.g., '/dashboard')
  label: string       // Display text (e.g., 'Dashboard')
  icon: string        // Icon identifier
  badge?: number      // Optional notification count
}
```

### User Context (from AuthContext)

```typescript
interface User {
  email: string
  // Additional fields from Cognito user attributes
}
```

### Placeholder Data Structures

For the initial implementation, all data is hardcoded placeholders:

```typescript
// Stats card data
interface StatCard {
  label: string
  value: number | string
  icon: string
  variant?: 'default' | 'cta'
}

// Activity item data
interface ActivityItem {
  id: string
  title: string
  timestamp: string
  priority: 'high' | 'medium' | 'low'
  type: string
}

// Timeline event data
interface TimelineEvent {
  id: string
  timestamp: string
  type: string
  description: string
}
```

These interfaces define the shape of data that will eventually come from the backend. For now, components use hardcoded arrays of these objects.


## Error Handling

### Navigation Errors

**Invalid Routes**: 
- React Router's catch-all route (`path="*"`) redirects to `/dashboard`
- Ensures users never see a broken page
- Maintains consistent navigation state

**Authentication Failures**:
- ProtectedRoute component handles unauthenticated access
- Redirects to login page with return URL preserved
- Layout component never renders for unauthenticated users

### Component Rendering Errors

**Error Boundaries**:
- Implement React Error Boundary around Layout component
- Catches rendering errors in child components
- Displays fallback UI with option to reload or return to dashboard
- Logs errors to console for debugging

**Missing User Data**:
- TopHeader gracefully handles missing user information
- Falls back to "User" if email is unavailable
- Avatar displays initials or default icon

### Responsive Layout Handling

**Viewport Size Changes**:
- Layout adapts to viewport changes without breaking
- Mobile breakpoint (<768px) triggers navigation collapse
- Content area maintains scrollability at all sizes

**Content Overflow**:
- Main content area uses `overflow-y: auto` for scrolling
- Long navigation lists scroll independently
- Fixed header and nav prevent layout shift

## Testing Strategy

This feature requires both unit tests and property-based tests to ensure correctness. The testing approach balances specific example validation with comprehensive property verification.

### Unit Testing Approach

Unit tests focus on specific behaviors, edge cases, and integration points:

**Component Rendering**:
- Layout component renders all three sections (nav, header, content)
- LeftNav renders all navigation items in correct order
- TopHeader renders logo, selectors, and user menu
- Dashboard renders all sub-components (stats, activity, timeline, sidebar)
- Stub pages render heading and placeholder content

**Navigation Behavior**:
- Clicking nav items navigates to correct routes
- Active route highlights correct nav item
- Root path redirects to /dashboard
- Invalid routes redirect to /dashboard

**Authentication Integration**:
- Protected routes require authentication
- Unauthenticated users redirect to login
- User information displays in header

**Responsive Behavior**:
- Layout adapts to mobile viewport
- Navigation collapses on small screens
- Content remains scrollable

**Error Cases**:
- Error boundary catches rendering errors
- Missing user data displays fallback
- Invalid routes handle gracefully

### Property-Based Testing Approach

Property-based tests verify universal behaviors across many inputs using a PBT library. For React/TypeScript, we'll use **fast-check** (https://github.com/dubzzz/fast-check).

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with feature name and property reference
- Tests run as part of standard test suite

**Property Test Focus**:
- Route navigation preserves authentication state
- Layout structure remains consistent across route changes
- Navigation active state always matches current route
- Component hierarchy maintains correct parent-child relationships

### Testing Tools

**Unit Testing**:
- **Vitest**: Fast unit test runner (Vite-native)
- **@testing-library/react**: Component testing utilities
- **@testing-library/user-event**: User interaction simulation

**Property-Based Testing**:
- **fast-check**: Property-based testing library for TypeScript
- Generates random test cases for comprehensive coverage
- Integrates with Vitest test runner

**Test Organization**:
```
frontend/src/
├── components/
│   ├── Layout.tsx
│   ├── Layout.test.tsx
│   ├── LeftNav.tsx
│   ├── LeftNav.test.tsx
│   └── ...
├── pages/
│   ├── Dashboard.tsx
│   ├── Dashboard.test.tsx
│   └── ...
```

### Test Coverage Goals

- **Component Coverage**: All components have unit tests
- **Route Coverage**: All routes tested for rendering and navigation
- **Property Coverage**: Each correctness property has corresponding PBT test
- **Integration Coverage**: Layout + routing + auth integration tested


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Layout wraps all authenticated pages

*For any* authenticated route in the application (/dashboard, /timeline, /catch-up-brief, /insights, /integrations), navigating to that route should render the corresponding page component within the Layout component structure (with LeftNav, TopHeader, and content area).

**Validates: Requirements 1.2, 6.1, 7.1, 8.1, 9.1, 10.2**

### Property 2: Navigation click navigates to correct route

*For any* navigation item in the LeftNav, clicking that item should navigate the application to the route path associated with that navigation item.

**Validates: Requirements 2.2**

### Property 3: Active route highlighting matches current route

*For any* route in the application, when that route is active, the corresponding navigation item in the LeftNav should be highlighted, and all other navigation items should not be highlighted.

**Validates: Requirements 2.3**

### Property 4: Navigation items have consistent styling

*For any* navigation item in the LeftNav, the item should have the same base CSS classes and styling properties as all other navigation items (excluding active state styling).

**Validates: Requirements 2.4**

### Property 5: Navigation items display icon and text

*For any* navigation item in the LeftNav, the rendered item should contain both an icon element and a text label element.

**Validates: Requirements 2.5**

### Property 6: Badge display and content

*For any* navigation item that has a badge count defined, the rendered item should display a badge element containing a numeric value, and for any navigation item without a badge count, no badge element should be rendered.

**Validates: Requirements 3.1, 3.3**

### Property 7: Stub pages have consistent structure

*For any* stub page (Timeline, Catch-Up Brief, Insights, Integrations), the rendered page should contain a heading element with the page name and placeholder content indicating the page is under development.

**Validates: Requirements 6.2, 6.3, 7.2, 7.3, 8.2, 8.3, 9.2, 9.3**

### Property 8: Layout maintains consistent spacing across viewports

*For any* viewport width, the Layout component should maintain its structural spacing and dimensions within expected ranges (nav width, header height, content padding) without breaking or overlapping.

**Validates: Requirements 1.3**

### Property 9: Client-side routing without page reloads

*For any* navigation action between routes, the application should update the displayed content without triggering a full page reload (document should not reload).

**Validates: Requirements 10.3**

### Property 10: Browser history maintained

*For any* navigation action to a new route, the browser history should be updated with the new route, allowing back/forward navigation to work correctly.

**Validates: Requirements 10.5**

