import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import CLERK_CONFIG from './config/clerk';

// Layout Components
import MainLayout from './components/layout/MainLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Expenses from './pages/Expenses';
import Contractors from './pages/Contractors';
import Works from './pages/Works';
import Reports from './pages/Reports';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Protected Route Component
function ProtectedRoute({ children }) {
  return (
    <>
      <SignedIn>
        <MainLayout>{children}</MainLayout>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={CLERK_CONFIG.publishableKey}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="min-h-screen bg-content-bg" dir="rtl">
            <Routes>
              {/* Protected Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects"
                element={
                  <ProtectedRoute>
                    <Projects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/expenses"
                element={
                  <ProtectedRoute>
                    <Expenses />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contractors"
                element={
                  <ProtectedRoute>
                    <Contractors />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/works"
                element={
                  <ProtectedRoute>
                    <Works />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/billing"
                element={
                  <ProtectedRoute>
                    <Billing />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              {/* 404 Page */}
              <Route path="*" element={<NotFound />} />
            </Routes>

            {/* Toast Notifications */}
            <Toaster
              position="top-left"
              reverseOrder={false}
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#fff',
                  color: '#2d3748',
                  borderRadius: '0.75rem',
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  fontFamily: 'Rubik, sans-serif',
                },
                success: {
                  iconTheme: {
                    primary: '#48bb78',
                    secondary: '#fff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#f56565',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </div>
        </Router>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;