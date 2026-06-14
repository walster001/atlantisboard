import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Box, Loader, ScrollArea, Text, Title } from '@mantine/core';
import { api } from '../utils/api.js';
import '../components/auth/privacyPolicyContent.css';

export default function PrivacyPolicyPage(): ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const document = await api.getPrivacyPolicy();
        if (!cancelled) {
          setHtml(document.html);
          setVersion(document.version);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load the privacy notice. Please try again later.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box className="min-h-screen bg-gray-50 px-4 py-8">
      <Box maw={800} mx="auto">
        <Title order={1} mb="md">Privacy Notice</Title>
        {version ? (
          <Text size="sm" c="dimmed" mb="lg">
            Version {version}
          </Text>
        ) : null}
        {error ? (
          <Text c="red">{error}</Text>
        ) : html === null ? (
          <Loader />
        ) : (
          <ScrollArea.Autosize mah="none" offsetScrollbars>
            <Box
              className="kb-privacy-policy-content"
              // Sanitized HTML from server markdown render.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </ScrollArea.Autosize>
        )}
        <Text mt="xl" size="sm">
          <Link to="/login">Back to sign in</Link>
        </Text>
      </Box>
    </Box>
  );
}
