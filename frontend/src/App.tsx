import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Callback } from './pages/Callback'
import { Dashboard } from './pages/Dashboard'
import { Timeline } from './pages/Timeline'
import { CatchUpBrief } from './pages/CatchUpBrief'
import { Insights } from './pages/Insights'
import { Integrations } from './pages/Integrations'
import { ErrorBoundary } from './components/ErrorBoundary'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/callback" element={<Callback />} />
        
        {/* Protected routes with Layout */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/catch-up-brief" element={<CatchUpBrief />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/integrations" element={
            <ErrorBoundary>
              <Integrations />
            </ErrorBoundary>
          } />
        </Route>
        
        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}

export default App
