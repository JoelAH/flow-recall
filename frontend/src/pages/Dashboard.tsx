import './Dashboard.css';

// Placeholder data
const statsData = [
  { label: 'Messages', value: 142, icon: '✉️', variant: 'default' as const },
  { label: 'Decisions', value: 8, icon: '✓', variant: 'default' as const },
  { label: 'Tasks', value: 23, icon: '☐', variant: 'default' as const },
  { label: 'Potential Risks', value: 2, icon: '⚠️', variant: 'default' as const },
  { label: 'View Catch-Up Brief', value: '', icon: '→', variant: 'cta' as const },
];

const missedItems = [
  {
    id: '1',
    title: 'Q4 Budget Review Meeting Scheduled',
    timestamp: '2 hours ago',
    priority: 'high' as const,
    type: 'meeting',
  },
  {
    id: '2',
    title: 'Design System Update Requires Your Approval',
    timestamp: '4 hours ago',
    priority: 'high' as const,
    type: 'decision',
  },
  {
    id: '3',
    title: 'New Team Member Introduction',
    timestamp: '1 day ago',
    priority: 'medium' as const,
    type: 'announcement',
  },
  {
    id: '4',
    title: 'Infrastructure Migration Timeline Updated',
    timestamp: '1 day ago',
    priority: 'medium' as const,
    type: 'update',
  },
];

const timelineEvents = [
  {
    id: '1',
    timestamp: '10:30 AM',
    type: 'Decision',
    description: 'Engineering team approved migration to microservices architecture',
  },
  {
    id: '2',
    timestamp: '9:15 AM',
    type: 'Task',
    description: 'Sarah assigned you to review API documentation',
  },
  {
    id: '3',
    timestamp: 'Yesterday 4:20 PM',
    type: 'Message',
    description: 'Product team shared updated roadmap for Q1 2026',
  },
  {
    id: '4',
    timestamp: 'Yesterday 2:45 PM',
    type: 'Meeting',
    description: 'Sprint planning completed with 15 story points committed',
  },
  {
    id: '5',
    timestamp: 'Yesterday 11:00 AM',
    type: 'Risk',
    description: 'Dependency on external API identified as potential blocker',
  },
  {
    id: '6',
    timestamp: '2 days ago',
    type: 'Decision',
    description: 'Leadership approved additional headcount for Q1',
  },
];

const priorityData = {
  high: [
    'Q4 Budget Review - Response needed by Friday',
    'Design System Approval - Blocking 3 teams',
  ],
  medium: [
    'Infrastructure Migration Timeline',
    'New Team Member Onboarding',
    'API Documentation Review',
  ],
  informational: [
    'Q1 Roadmap Shared',
    'Sprint Planning Complete',
    'Team Social Event Next Week',
  ],
};

function StatsCards() {
  return (
    <div className="stats-cards">
      {statsData.map((stat, index) => (
        <div key={index} className={`stat-card stat-card-${stat.variant}`}>
          <div className="stat-icon">{stat.icon}</div>
          <div className="stat-content">
            <div className="stat-label">{stat.label}</div>
            {stat.value && <div className="stat-value">{stat.value}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function WhatYouMissed() {
  return (
    <div className="what-you-missed">
      <h2>What You Missed</h2>
      <div className="missed-items">
        {missedItems.map((item) => (
          <div key={item.id} className="missed-item">
            <div className="missed-item-header">
              <span className="missed-item-type">{item.type}</span>
              <span className={`missed-item-priority priority-${item.priority}`}>
                {item.priority}
              </span>
            </div>
            <div className="missed-item-title">{item.title}</div>
            <div className="missed-item-timestamp">{item.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentTimeline() {
  return (
    <div className="recent-timeline">
      <h2>Recent Timeline</h2>
      <div className="timeline-events">
        {timelineEvents.map((event) => (
          <div key={event.id} className="timeline-event">
            <div className="timeline-event-time">{event.timestamp}</div>
            <div className="timeline-event-content">
              <span className="timeline-event-type">{event.type}</span>
              <span className="timeline-event-description">{event.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityOverview() {
  return (
    <div className="priority-overview">
      <h2>Priority Overview</h2>
      
      <div className="priority-section">
        <div className="priority-header">
          <span className="priority-label priority-high">High Priority</span>
          <span className="priority-count">{priorityData.high.length}</span>
        </div>
        <ul className="priority-list">
          {priorityData.high.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="priority-section">
        <div className="priority-header">
          <span className="priority-label priority-medium">Medium Priority</span>
          <span className="priority-count">{priorityData.medium.length}</span>
        </div>
        <ul className="priority-list">
          {priorityData.medium.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="priority-section">
        <div className="priority-header">
          <span className="priority-label priority-informational">Informational</span>
          <span className="priority-count">{priorityData.informational.length}</span>
        </div>
        <ul className="priority-list">
          {priorityData.informational.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Dashboard() {
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
  );
}
