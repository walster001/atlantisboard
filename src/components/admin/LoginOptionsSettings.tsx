import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Info, Database, CheckCircle2, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type LoginStyle = 'local_accounts' | 'google_only' | 'google_verified';

interface LoginOptionsState {
  login_style: LoginStyle;
}

interface MySQLConfigState {
  db_host: string;
  db_name: string;
  db_user: string;
  db_password: string;
  verification_query: string;
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
  const [mysqlConfigOpen, setMysqlConfigOpen] = useState(false);
  const [mysqlConfigured, setMysqlConfigured] = useState<boolean | null>(null);
  
  const [settings, setSettings] = useState<LoginOptionsState>({
    login_style: 'google_only',
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
      const { data: appSettings, error: appError } = await supabase
        .from('app_settings')
        .select('login_style')
        .eq('id', 'default')
        .maybeSingle();

      if (appError) throw appError;

      if (appSettings) {
        setSettings({
          login_style: (appSettings.login_style as LoginStyle) || 'google_only',
        });
      }

      // Check if MySQL is configured (admin only can see this)
      const { data: mysqlData } = await supabase
        .from('mysql_config')
        .select('is_configured')
        .eq('id', 'default')
        .maybeSingle();

      setMysqlConfigured(mysqlData?.is_configured ?? false);
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 'default',
          login_style: settings.login_style,
          updated_at: new Date().toISOString(),
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

  const handleSaveMySqlConfig = async () => {
    if (!mysqlConfig.db_host || !mysqlConfig.db_name || !mysqlConfig.db_user || !mysqlConfig.db_password) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in all database connection fields.',
        variant: 'destructive',
      });
      return;
    }

    setSavingMySql(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('save-mysql-config', {
        body: {
          db_host: mysqlConfig.db_host,
          db_name: mysqlConfig.db_name,
          db_user: mysqlConfig.db_user,
          db_password: mysqlConfig.db_password,
          verification_query: mysqlConfig.verification_query,
        },
      });

      if (response.error) throw response.error;

      const data = response.data;
      if (data.error) throw new Error(data.error);

      setMysqlConfigured(true);
      // Clear password from state for security
      setMysqlConfig(prev => ({ ...prev, db_password: '' }));
      
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

  const selectedOption = loginStyleOptions.find(opt => opt.value === settings.login_style);

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
              value={settings.login_style}
              onValueChange={(value: LoginStyle) => 
                setSettings(prev => ({ ...prev, login_style: value }))
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
      {settings.login_style === 'google_verified' && (
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
                      placeholder="e.g., 35.123.45.67 or db.example.com"
                      value={mysqlConfig.db_host}
                      onChange={(e) => setMysqlConfig(prev => ({ ...prev, db_host: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-name">Database Name</Label>
                    <Input
                      id="db-name"
                      placeholder="e.g., myapp_production"
                      value={mysqlConfig.db_name}
                      onChange={(e) => setMysqlConfig(prev => ({ ...prev, db_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-user">Database User (read-only recommended)</Label>
                    <Input
                      id="db-user"
                      placeholder="e.g., readonly_user"
                      value={mysqlConfig.db_user}
                      onChange={(e) => setMysqlConfig(prev => ({ ...prev, db_user: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-password">Database Password</Label>
                    <Input
                      id="db-password"
                      type="password"
                      placeholder="Enter password"
                      value={mysqlConfig.db_password}
                      onChange={(e) => setMysqlConfig(prev => ({ ...prev, db_password: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verification-query">Verification SQL Query</Label>
                  <Textarea
                    id="verification-query"
                    placeholder="SELECT 1 FROM users WHERE email = ? LIMIT 1"
                    value={mysqlConfig.verification_query}
                    onChange={(e) => setMysqlConfig(prev => ({ ...prev, verification_query: e.target.value }))}
                    className="font-mono text-sm"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">?</code> as a placeholder for the user's email address.
                    The query should return at least one row if the user exists.
                  </p>
                </div>

                <Button 
                  onClick={handleSaveMySqlConfig} 
                  disabled={savingMySql}
                  className="w-full"
                >
                  {savingMySql ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Database Configuration
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
