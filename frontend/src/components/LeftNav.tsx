import { Link, useLocation } from 'react-router-dom'
import { HiHome, HiClock, HiDocumentText, HiLightBulb, HiCog } from 'react-icons/hi'
import './LeftNav.css'

interface NavItem {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: HiHome },
  { path: '/timeline', label: 'Timeline', icon: HiClock },
  { path: '/catch-up-brief', label: 'Catch-Up Brief', icon: HiDocumentText, badge: 3 },
  { path: '/insights', label: 'Insights', icon: HiLightBulb },
  { path: '/integrations', label: 'Integrations', icon: HiCog }
]

interface NavItemProps {
  item: NavItem
  isActive: boolean
}

function NavItemComponent({ item, isActive }: NavItemProps) {
  const Icon = item.icon
  return (
    <li>
      <Link 
        to={item.path} 
        className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
      >
        <Icon className="nav-item-icon" />
        <span className="nav-item-label">{item.label}</span>
        {item.badge !== undefined && (
          <span className="nav-item-badge">{item.badge}</span>
        )}
      </Link>
    </li>
  )
}

export default function LeftNav() {
  const location = useLocation()

  return (
    <nav className="left-nav">
      <div className="nav-brand">FlowRecall</div>
      <ul className="nav-items">
        {navItems.map(item => (
          <NavItemComponent
            key={item.path}
            item={item}
            isActive={location.pathname === item.path}
          />
        ))}
      </ul>
    </nav>
  )
}
