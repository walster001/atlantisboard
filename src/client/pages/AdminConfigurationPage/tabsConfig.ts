/** Main Configuration / Customisation pill tabs */
export const MAIN_TAB_ICON_SIZE = 22;
export const MAIN_TAB_ICON_STROKE = 1.5;

export const CONFIGURATION_SUBTABS = [
  { value: 'login-options', label: 'Login options' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'users', label: 'Users' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'email', label: 'Email' },
  { value: 'database', label: 'Database' },
  { value: 'file-storage', label: 'File Storage' },
  { value: 'backup', label: 'Backup' },
  { value: 'monitor', label: 'Monitor' },
] as const;

export const CUSTOMISATION_SUBTABS = [
  { value: 'login-branding', label: 'Login branding' },
  { value: 'app-branding', label: 'App branding' },
  { value: 'email-branding', label: 'Email branding' },
  { value: 'custom-fonts', label: 'Custom fonts' },
] as const;

export type ConfigurationSubtab = (typeof CONFIGURATION_SUBTABS)[number]['value'];
export type CustomisationSubtab = (typeof CUSTOMISATION_SUBTABS)[number]['value'];
