import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { api } from '../../utils/api.js';
import './privacyPolicyContent.css';

interface PrivacyPolicyAcceptanceCardProps {
  readonly onAccept: () => Promise<void>;
}

export function PrivacyPolicyAcceptanceCard({
  onAccept,
}: PrivacyPolicyAcceptanceCardProps): ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const document = await api.getPrivacyPolicy();
        if (!cancelled) {
          setHtml(document.html);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Could not load the privacy notice. Please try again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAccept = async (): Promise<void> => {
    if (!agreed) {
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onAccept();
    } catch {
      setSubmitError('Could not save your acceptance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box className="kb-login-host min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card shadow="lg" padding="xl" radius="md" w="100%" maw={560}>
        <Stack gap="md">
          <Title order={2} ta="center">Privacy Notice</Title>
          <Text size="sm" c="dimmed" ta="center">
            Please read and accept the privacy notice before continuing.
          </Text>
          {loadError ? (
            <Alert color="red">{loadError}</Alert>
          ) : html === null ? (
            <Text size="sm" c="dimmed" ta="center">Loading privacy notice…</Text>
          ) : (
            <ScrollArea.Autosize mah={280} offsetScrollbars type="auto">
              <Box
                className="kb-privacy-policy-content px-1"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </ScrollArea.Autosize>
          )}
          <Text size="sm" ta="center">
            <Link to="/legal/privacy-policy" target="_blank" rel="noopener noreferrer">
              Open full privacy notice
            </Link>
          </Text>
          <Checkbox
            checked={agreed}
            onChange={(event) => setAgreed(event.currentTarget.checked)}
            label="I have read and agree to the Privacy Notice"
          />
          {submitError ? (
            <Alert color="red">{submitError}</Alert>
          ) : null}
          <Button
            fullWidth
            disabled={!agreed || html === null || loadError !== null}
            loading={submitting}
            onClick={() => void handleAccept()}
          >
            Continue
          </Button>
        </Stack>
      </Card>
    </Box>
  );
}
