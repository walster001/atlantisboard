import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { MinioBucketName } from '../../../../shared/constants/minioBuckets.js';
import type {
  AdminFileStorageBucketInfo,
  AdminFileStorageObjectEntry,
} from '../../../../shared/types/adminFileStorage.js';
import { api } from '../../../utils/api.js';

export function useAdminFileStoragePanelState() {
  const [buckets, setBuckets] = useState<readonly AdminFileStorageBucketInfo[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<MinioBucketName | null>(null);
  const [prefix, setPrefix] = useState('');
  const [entries, setEntries] = useState<readonly AdminFileStorageObjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const loadBuckets = useCallback(async () => {
    const response = await api.listAdminFileStorageBuckets();
    setBuckets(response.buckets);
    const firstAvailable = response.buckets.find((bucket) => bucket.exists);
    setSelectedBucket((current) => {
      if (current != null && response.buckets.some((bucket) => bucket.name === current && bucket.exists)) {
        return current;
      }
      return firstAvailable?.name ?? null;
    });
  }, []);

  const loadObjects = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (selectedBucket == null) {
        setEntries([]);
        return;
      }
      const silent = opts?.silent === true;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const response = await api.listAdminFileStorageObjects(selectedBucket, prefix);
        setEntries(response.entries);
      } catch (e: unknown) {
        notifications.show({
          title: 'Could not load objects',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [prefix, selectedBucket],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadBuckets();
      } catch (e: unknown) {
        notifications.show({
          title: 'Storage buckets unavailable',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBuckets]);

  useEffect(() => {
    void loadObjects();
  }, [loadObjects]);

  const refresh = useCallback(async () => {
    await loadObjects({ silent: true });
  }, [loadObjects]);

  const openFolder = useCallback((key: string) => {
    setPrefix(key);
  }, []);

  const navigateToPrefix = useCallback((nextPrefix: string) => {
    setPrefix(nextPrefix);
  }, []);

  const uploadFile = useCallback(
    async (file: File | null) => {
      if (file == null || selectedBucket == null) {
        return;
      }
      setUploading(true);
      try {
        await api.uploadAdminFileStorageObject({
          bucket: selectedBucket,
          prefix,
          file,
        });
        notifications.show({
          title: 'Upload complete',
          message: `${file.name} uploaded.`,
          color: 'green',
        });
        await loadObjects({ silent: true });
      } catch (e: unknown) {
        notifications.show({
          title: 'Upload failed',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setUploading(false);
      }
    },
    [loadObjects, prefix, selectedBucket],
  );

  const createFolder = useCallback(
    async (folderName: string) => {
      if (selectedBucket == null) {
        return;
      }
      setCreatingFolder(true);
      try {
        await api.createAdminFileStorageFolder({
          bucket: selectedBucket,
          prefix,
          folderName,
        });
        notifications.show({
          title: 'Folder created',
          message: `"${folderName}" is ready.`,
          color: 'green',
        });
        await loadObjects({ silent: true });
      } catch (e: unknown) {
        notifications.show({
          title: 'Could not create folder',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setCreatingFolder(false);
      }
    },
    [loadObjects, prefix, selectedBucket],
  );

  const downloadObject = useCallback(
    async (key: string) => {
      if (selectedBucket == null) {
        return;
      }
      setDownloadingKey(key);
      try {
        await api.downloadAdminFileStorageObject(selectedBucket, key);
      } catch (e: unknown) {
        notifications.show({
          title: 'Download failed',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setDownloadingKey(null);
      }
    },
    [selectedBucket],
  );

  const deleteObject = useCallback(
    async (key: string) => {
      if (selectedBucket == null) {
        return;
      }
      setDeletingKey(key);
      try {
        const result = await api.deleteAdminFileStorageObjects(selectedBucket, [key]);
        notifications.show({
          title: 'Deleted',
          message: `Removed ${result.deletedCount} object${result.deletedCount === 1 ? '' : 's'}.`,
          color: 'green',
        });
        await loadObjects({ silent: true });
      } catch (e: unknown) {
        notifications.show({
          title: 'Delete failed',
          message: e instanceof Error ? e.message : 'Unknown error',
          color: 'red',
        });
      } finally {
        setDeletingKey(null);
      }
    },
    [loadObjects, selectedBucket],
  );

  return {
    buckets,
    selectedBucket,
    setSelectedBucket,
    prefix,
    entries,
    loading,
    refreshing,
    uploading,
    creatingFolder,
    deletingKey,
    downloadingKey,
    refresh,
    openFolder,
    navigateToPrefix,
    uploadFile,
    createFolder,
    downloadObject,
    deleteObject,
  };
}

export type UseAdminFileStoragePanelStateResult = ReturnType<typeof useAdminFileStoragePanelState>;
