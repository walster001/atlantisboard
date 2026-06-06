import { Navigate, useLocation } from 'react-router-dom';
import { Loader, Box } from '@mantine/core';
import { useAuthContext } from '../contexts/AuthContext.js';
import { storePostLoginRedirect } from '../../shared/utils/postLoginRedirect.js';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authenticated, loading } = useAuthContext();
  const location = useLocation();

  if (loading) {
    return (
      <Box className="min-h-screen flex items-center justify-center">
        <Loader size="lg" />
      </Box>
    );
  }

  if (!authenticated) {
    storePostLoginRedirect(`${location.pathname}${location.search}`);
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

