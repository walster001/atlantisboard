import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Settings, Wrench, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandingSettings } from '@/components/admin/BrandingSettings';

// Placeholder settings data structure
const tabConfig = {
  configuration: {
    icon: Wrench,
    label: 'Configuration',
    subTabs: [
      { id: 'general', label: 'General' },
      { id: 'security', label: 'Security' },
      { id: 'permissions', label: 'Permissions' },
      { id: 'integrations', label: 'Integrations' },
    ],
  },
  customisation: {
    icon: Sparkles,
    label: 'Customisation',
    subTabs: [
      { id: 'branding', label: 'Branding' },
      { id: 'labels', label: 'Labels' },
      { id: 'workflows', label: 'Workflows' },
      { id: 'templates', label: 'Templates' },
    ],
  },
};

type MainTab = keyof typeof tabConfig;

export default function AdminConfig() {
  const { user, loading: authLoading, isAppAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('configuration');
  const [activeSubTab, setActiveSubTab] = useState<string>('general');

  // Check if we're in preview/development mode
  const isPreviewMode = window.location.hostname.includes('lovableproject.com') || 
                        window.location.hostname === 'localhost';

  useEffect(() => {
    // Skip auth redirect in preview mode
    if (isPreviewMode) return;
    
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, isPreviewMode]);

  useEffect(() => {
    // Skip admin check in preview mode
    if (isPreviewMode) return;
    
    if (!authLoading && user && !isAppAdmin) {
      navigate('/');
    }
  }, [user, authLoading, isAppAdmin, navigate, isPreviewMode]);

  // Reset sub-tab when main tab changes
  useEffect(() => {
    setActiveSubTab(tabConfig[activeMainTab].subTabs[0].id);
  }, [activeMainTab]);

  if (authLoading && !isPreviewMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAppAdmin && !isPreviewMode) {
    return null;
  }

  const currentConfig = tabConfig[activeMainTab];

  return (
    <div className="min-h-screen bg-kanban-bg flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Admin Configuration</h1>
          </div>
        </div>
      </header>

      {/* Horizontal Tab Navigation */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4">
          <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as MainTab)}>
            <TabsList className="h-12 bg-transparent gap-2 p-0">
              {(Object.keys(tabConfig) as MainTab[]).map((tabKey) => {
                const tab = tabConfig[tabKey];
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tabKey}
                    value={tabKey}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Vertical Sub-Navigation */}
        <aside className="w-56 bg-card border-r border-border p-4 shrink-0">
          <nav className="space-y-1">
            {currentConfig.subTabs.map((subTab) => (
              <button
                key={subTab.id}
                onClick={() => setActiveSubTab(subTab.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  activeSubTab === subTab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {subTab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Settings Content */}
        <main className="flex-1 p-6 overflow-auto">
          <SettingsContent 
            mainTab={activeMainTab} 
            subTab={activeSubTab} 
          />
        </main>
      </div>
    </div>
  );
}

// Settings content component
function SettingsContent({ mainTab, subTab }: { mainTab: MainTab; subTab: string }) {
  const currentConfig = tabConfig[mainTab];
  const currentSubTab = currentConfig.subTabs.find(s => s.id === subTab);

  // Render specific settings based on tab
  if (mainTab === 'customisation' && subTab === 'branding') {
    return <BrandingSettings />;
  }

  // Placeholder for other settings
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{currentSubTab?.label}</h2>
        <p className="text-muted-foreground">
          Configure {currentSubTab?.label.toLowerCase()} settings for your application.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coming Soon</CardTitle>
            <CardDescription>
              Settings for {currentSubTab?.label} will be available here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-10 bg-muted rounded-md animate-pulse" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
