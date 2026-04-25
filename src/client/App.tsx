import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflinePersistenceNotice } from './components/OfflinePersistenceNotice.js';
import { AuthProvider } from './contexts/AuthContext';
import { AppBrandingProvider } from './contexts/AppBrandingContext.js';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import { mantineTheme } from './config/mantineTheme.js';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import '@mantine/notifications/styles.css';

const MANTINE_MODALS_PROVIDER_PROPS = { centered: true } as const;

// Lazy load routes for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel.js').then((m) => ({ default: m.AdminPanel })));
const InviteAcceptPage = lazy(() => import('./pages/InviteAcceptPage.js'));

// Lazy load additional auth pages
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const AdminConfigurationPage = lazy(() => import('./pages/AdminConfigurationPage'));

/** Old deep links `/boards/:boardId/cards/:cardId` open the board with the card overlay. */
function BoardCardRouteRedirect() {
  const { boardId, cardId } = useParams<{ boardId: string; cardId: string }>();
  if (!boardId?.trim() || !cardId?.trim()) {
    return <Navigate to="/" replace />;
  }
  return (
    <Navigate
      to={{ pathname: `/boards/${boardId}`, search: `?card=${encodeURIComponent(cardId)}` }}
      replace
    />
  );
}

function App() {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="light">
      <ModalsProvider modalProps={MANTINE_MODALS_PROVIDER_PROPS}>
        <Notifications />
        <OfflinePersistenceNotice />
        <BrowserRouter>
          <AppBrandingProvider>
            <ErrorBoundary>
              <ThemeProvider>
                <AuthProvider>
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            }>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<Navigate to="/login" replace />} />
                <Route path="/forgot-password" element={<Navigate to="/login?forgot=1" replace />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <HomePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/workspaces/:id"
                  element={
                    <ProtectedRoute>
                      <WorkspacePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/boards/:boardId"
                  element={
                    <ProtectedRoute>
                      <BoardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/boards/:boardId/cards/:cardId"
                  element={
                    <ProtectedRoute>
                      <BoardCardRouteRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/" replace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/configuration"
                  element={
                    <ProtectedRoute>
                      <AdminConfigurationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminPanel />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/invite/:token"
                  element={
                    <ProtectedRoute>
                      <InviteAcceptPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
                </AuthProvider>
              </ThemeProvider>
            </ErrorBoundary>
          </AppBrandingProvider>
        </BrowserRouter>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;

