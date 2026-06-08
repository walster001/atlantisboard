/** Name of the environment variable that sets the on-host backup directory (server filesystem). */
export const BACKUP_LOCATION_ENV_NAME = 'BACKUP_LOCATION' as const;

/** Default backup directory inside the Docker fullstack app container (bind-mounted from the host). */
export const DOCKER_FULLSTACK_BACKUP_LOCATION = '/data/backups' as const;

/** Hint shown in the admin backup panel when Docker fullstack mode is detected. */
export const BACKUP_LOCATION_DOCKER_HINT =
  'Docker fullstack: use /data/backups inside the container. Host files are stored under ATLANTISBOARD_BACKUP_HOST_DIR (see install .env and docker-compose.fullstack.yml).';

/**
 * Operator guidance when {@link BACKUP_LOCATION_ENV_NAME} is missing or invalid on the server.
 * Shown in Mantine notifications and in server-side configuration errors.
 */
export const BACKUP_LOCATION_SETUP_GUIDANCE =
  'Set BACKUP_LOCATION to an absolute path where backup archives should be written. On bare-metal installs use a host path (for example /var/backups/atlboard). In Docker fullstack use /data/backups and bind-mount a host folder via ATLANTISBOARD_BACKUP_HOST_DIR. Add it to your deployment .env or save from this panel when .env is writable. See .env.example.';

/** Returns true when the app process is running in Docker fullstack Compose (see docker-compose.fullstack.yml). */
export function isDockerFullstackDeployment(): boolean {
  return process.env.ATL_DOCKER_FULLSTACK === 'true';
}
