import { useEffect, useState } from 'react';
import { api } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Info, Database, CheckCircle2, XCircle, Plug } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type LoginStyle = 'local_accounts' | 'google_only' | 'google_verified';

interface LoginOptionsState {
  loginStyle: LoginStyle;
}

interface MySQLConfigState {
  db_host: string;
  db_name: string;
  db_user: string;
  db_password: string;
  verification_query: string;
}

interface ValidationErrors {
  db_host?: string;
  db_name?: string;
  db_user?: string;
  db_password?: string;
  verification_query?: string;
}

const loginStyleOptions: { value: LoginStyle; label: string; description: string }[] = [
  {
    value: 'local_accounts',
    label: 'Local Accounts',
    description: 'Users can sign up and log in with email and password. Signup form is visible.',
  },
  {
    value: 'google_only',
    label: 'Google Login Only',
    description: 'Only Google authentication is available. Email/password fields and signup are hidden.',
  },
  {
    value: 'google_verified',
    label: 'Google Login + Database Verification',
    description: 'Google login with additional database verification. Users must exist in external MySQL database.',
  },
];

export function LoginOptionsSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMySql, setSavingMySql] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [mysqlConfigOpen, setMysqlConfigOpen] = useState(false);
  const [mysqlConfigured, setMysqlConfigured] = useState<boolean | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  
  const [settings, setSettings] = useState<LoginOptionsState>({
    loginStyle: 'google_only',
  });

  const [mysqlConfig, setMysqlConfig] = useState<MySQLConfigState>({
    db_host: '',
    db_name: '',
    db_user: '',
    db_password: '',
    verification_query: 'SELECT 1 FROM users WHERE email = ? LIMIT 1',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Fetch login style
      const { data: appSettings, error: appError } = await api
        .from('app_settings')
        .select('loginStyle')
        .eq('id', 'default')
        .maybeSingle();

      if (appError) throw appError;

      if (appSettings) {
        setSettings({
          loginStyle: ((appSettings as any).loginStyle as LoginStyle) || 'google_only',
        });
      }

      // Check if MySQL is configured (admin only can see this)
      const { data: mysqlData } = await api
        .from('mysql_config')
        .select('isConfigured')
        .eq('id', 'default')
        .maybeSingle();

      setMysqlConfigured((mysqlData as any)?.isConfigured ?? false);
    } catch (error) {
      console.error('Error fetching login options:', error);
      toast({
        title: 'Error',
        description: 'Failed to load login options.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Prevent saving google_verified without configured database
    if (settings.loginStyle === 'google_verified' && !mysqlConfigured) {
      toast({
        title: 'Database not configured',
        description: 'You must configure and save the external database connection before enabling Google + Database Verification login.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await api
        .from('app_settings')
        .eq('id', 'default')
        .update({
          loginStyle: settings.loginStyle,
          updatedAt: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings saved',
        description: 'Login options have been updated successfully.',
      });
    } catch (error) {
      console.error('Error saving login options:', error);
      toast({
        title: 'Error',
        description: 'Failed to save login options.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const validateMySqlConfig = (): boolean => {
    const errors: ValidationErrors = {};
    
    // Host validation
    if (!mysqlConfig.db_host.trim()) {
      errors.db_host = 'Database host is required';
    } else if (mysqlConfig.db_host.length > 255) {
      errors.db_host = 'Host must be less than 255 characters';
    } else if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(mysqlConfig.db_host.trim())) {
      errors.db_host = 'Invalid host format. Use hostname or IP, optionally with port (e.g., db.example.com:3306)';
    }
    
    // Database name validation
    if (!mysqlConfig.db_name.trim()) {
      errors.db_name = 'Database name is required';
    } else if (mysqlConfig.db_name.length > 64) {
      errors.db_name = 'Database name must be less than 64 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(mysqlConfig.db_name.trim())) {
      errors.db_name = 'Database name can only contain letters, numbers, and underscores';
    }
    
    // Username validation
    if (!mysqlConfig.db_user.trim()) {
      errors.db_user = 'Database user is required';
    } else if (mysqlConfig.db_user.length > 32) {
      errors.db_user = 'Username must be less than 32 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(mysqlConfig.db_user.trim())) {
      errors.db_user = 'Username can only contain letters, numbers, and underscores';
    }
    
    // Password validation
    if (!mysqlConfig.db_password) {
      errors.db_password = 'Database password is required';
    } else if (mysqlConfig.db_password.length > 128) {
      errors.db_password = 'Password must be less than 128 characters';
    }
    
    // Query validation
    if (!mysqlConfig.verification_query.trim()) {
      errors.verification_query = 'Verification query is required';
    } else if (!mysqlConfig.verification_query.includes('?')) {
      errors.verification_query = 'Query must contain ? placeholder for email';
    } else if (mysqlConfig.verification_query.length > 1000) {
      errors.verification_query = 'Query must be less than 1000 characters';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateMySqlConfig()) {
      toast({
        title: 'Validation failed',
        description: 'Please fix the errors before testing the connection.',
        variant: 'destructive',
      });
      return;
    }

    setTestingConnection(true);
    setConnectionTestResult(null);
    
    try {
      const { data: { session } } = await api.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await api.request('/admin/mysql-config/test', {
        method: 'POST',
        body: JSON.stringify({
          db_host: mysqlConfig.db_host.trim(),
          db_name: mysqlConfig.db_name.trim(),
          db_user: mysqlConfig.db_user.trim(),
          db_password: mysqlConfig.db_password,
          verification_query: mysqlConfig.verification_query.trim(),
        }),
      });

      if (response.error) throw response.error;

      const data = response.data as { success: boolean; message: string };
      setConnectionTestResult({
        success: data.success,
        message: data.message,
      });
      
      if (data.success) {
        toast({
          title: 'Connection successful',
          description: data.message,
        });
      } else {
        toast({
          title: 'Connection failed',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      const message = error instanceof Error ? error.message : 'Failed to test connection';
      setConnectionTestResult({
        success: false,
        message,
      });
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveMySqlConfig = async () => {
    if (!validateMySqlConfig()) {
      toast({
        title: 'Validation failed',
        description: 'Please fix the errors before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSavingMySql(true);
    try {
      const response = await api.request('/admin/mysql-config', {
        method: 'POST',
        body: JSON.stringify({
          db_host: mysqlConfig.db_host.trim(),
          db_name: mysqlConfig.db_name.trim(),
          db_user: mysqlConfig.db_user.trim(),
          db_password: mysqlConfig.db_password,
          verification_query: mysqlConfig.verification_query.trim(),
        }),
      });

      if (response.error) throw response.error;

      const data = response.data as { error?: string };
      if (data.error) throw new Error(data.error);

      setMysqlConfigured(true);
      setConnectionTestResult(null);
      // Clear password from state for security
      setMysqlConfig(prev => ({ ...prev, db_password: '' }));
      setValidationErrors({});
      
      toast({
        title: 'Configuration saved',
        description: 'MySQL database configuration has been securely stored.',
      });
    } catch (error) {
      console.error('Error saving MySQL config:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save database configuration.',
        variant: 'destructive',
      });
    } finally {
      setSavingMySql(false);
    }
  };

  const clearFieldError = (field: keyof ValidationErrors) => {
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const selectedOption = loginStyleOptions.find(opt => opt.value === settings.loginStyle);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Login Options</h2>
          <p className="text-muted-foreground">
            Configure how users authenticate with your application.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Login Style</CardTitle>
          <CardDescription>
            Choose how users will authenticate with your application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-style">Authentication Method</Label>
            <Select
              value={settings.loginStyle}
              onValueChange={(value: LoginStyle) => 
                setSettings(prev => ({ ...prev, loginStyle: value }))
              }
            >
              <SelectTrigger id="login-style" className="w-full max-w-md">
                <SelectValue placeholder="Select login style" />
              </SelectTrigger>
              <SelectContent>
                {loginStyleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOption && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {selectedOption.description}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* MySQL Configuration - Only shown when google_verified is selected */}
      {settings.loginStyle === 'google_verified' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                <CardTitle className="text-base">External Database Configuration</CardTitle>
              </div>
              {mysqlConfigured !== null && (
                <div className="flex items-center gap-2 text-sm">
                  {mysqlConfigured ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-green-600">Configured</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-amber-600">Not configured</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <CardDescription>
              Configure the external MySQL database used to verify user emails during login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Collapsible open={mysqlConfigOpen} onOpenChange={setMysqlConfigOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {mysqlConfigured ? 'Update Database Configuration' : 'Configure Database Connection'}
                  <span className="text-xs text-muted-foreground">
                    {mysqlConfigOpen ? '(click to collapse)' : '(click to expand)'}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <Alert className="border-amber-500/50 bg-amber-500/10">
                  <Info className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    Credentials are encrypted and stored securely. They are never sent back to the browser after saving.
                    Use a read-only database user for security.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="db-host">Database Host</Label>
                    <Input
                      id="db-host"
                      placeholder="e.g., 35.123.45.67 or db.example.com:3306"
                      value={mysqlConfig.db_host}
                      onChange={(e) => {
                        setMysqlConfig(prev => ({ ...prev, db_host: e.target.value }));
                        clearFieldError('db_host');
                      }}
                      className={validationErrors.db_host ? 'border-destructive' : ''}
                    />
                    {validationErrors.db_host && (
                      <p className="text-xs text-destructive">{validationErrors.db_host}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-name">Database Name</Label>
                    <Input
                      id="db-name"
                      placeholder="e.g., myapp_production"
                      value={mysqlConfig.db_name}
                      onChange={(e) => {
                        setMysqlConfig(prev => ({ ...prev, db_name: e.target.value }));
                        clearFieldError('db_name');
                      }}
                      className={validationErrors.db_name ? 'border-destructive' : ''}
                    />
                    {validationErrors.db_name && (
                      <p className="text-xs text-destructive">{validationErrors.db_name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-user">Database User (read-only recommended)</Label>
                    <Input
                      id="db-user"
                      placeholder="e.g., readonly_user"
                      value={mysqlConfig.db_user}
                      onChange={(e) => {
                        setMysqlConfig(prev => ({ ...prev, db_user: e.target.value }));
                        clearFieldError('db_user');
                      }}
                      className={validationErrors.db_user ? 'border-destructive' : ''}
                    />
                    {validationErrors.db_user && (
                      <p className="text-xs text-destructive">{validationErrors.db_user}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-password">Database Password</Label>
                    <Input
                      id="db-password"
                      type="password"
                      placeholder="Enter password"
                      value={mysqlConfig.db_password}
                      onChange={(e) => {
                        setMysqlConfig(prev => ({ ...prev, db_password: e.target.value }));
                        clearFieldError('db_password');
                      }}
                      className={validationErrors.db_password ? 'border-destructive' : ''}
                    />
                    {validationErrors.db_password && (
                      <p className="text-xs text-destructive">{validationErrors.db_password}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verification-query">Verification SQL Query</Label>
                  <Textarea
                    id="verification-query"
                    placeholder="SELECT 1 FROM users WHERE email = ? LIMIT 1"
                    value={mysqlConfig.verification_query}
                    onChange={(e) => {
                      setMysqlConfig(prev => ({ ...prev, verification_query: e.target.value }));
                      clearFieldError('verification_query');
                    }}
                    className={`font-mono text-sm ${validationErrors.verification_query ? 'border-destructive' : ''}`}
                    rows={3}
                  />
                  {validationErrors.verification_query && (
                    <p className="text-xs text-destructive">{validationErrors.verification_query}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">?</code> as a placeholder for the user's email address.
                    The query should return at least one row if the user exists.
                  </p>
                </div>

                {/* Connection Test Result */}
                {connectionTestResult && (
                  <Alert className={connectionTestResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-destructive/50 bg-destructive/10'}>
                    {connectionTestResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <AlertDescription className={connectionTestResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>
                      {connectionTestResult.message}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-3">
                  <Button 
                    variant="outline"
                    onClick={handleTestConnection} 
                    disabled={testingConnection || savingMySql}
                    className="flex-1"
                  >
                    {testingConnection ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plug className="h-4 w-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                  <Button 
                    onClick={handleSaveMySqlConfig} 
                    disabled={savingMySql || testingConnection}
                    className="flex-1"
                  >
                    {savingMySql ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Configuration
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
