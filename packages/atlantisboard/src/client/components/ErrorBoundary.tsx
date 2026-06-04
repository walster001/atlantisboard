import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Stack, Text, Title, Box } from '@mantine/core';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Box className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--mantine-color-body)' }}>
          <Stack gap="md" ta="center">
            <Title order={1}>Something went wrong</Title>
            <Text c="dimmed">
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            <Button
              color="blue"
              mt="md"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </Button>
          </Stack>
        </Box>
      );
    }

    return this.props.children;
  }
}

