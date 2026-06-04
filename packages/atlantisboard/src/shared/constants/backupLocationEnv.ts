/** Name of the environment variable that sets the on-host backup directory (server filesystem). */
export const BACKUP_LOCATION_ENV_NAME = 'BACKUP_LOCATION' as const;

/**
 * Operator guidance when {@link BACKUP_LOCATION_ENV_NAME} is missing or invalid on the server.
 * Shown in Mantine notifications and in server-side configuration errors.
 */
export const BACKUP_LOCATION_SETUP_GUIDANCE =
  'Set BACKUP_LOCATION in the server environment to an absolute path on the host where backup archives should be written (for example /var/backups/atlboard). Add it to your deployment .env or process manager, then restart the application server. See .env.example for this variable.';
