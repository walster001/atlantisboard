import { useState, useEffect, useRef } from 'react';
import { api } from '@/integrations/api/client';
import { uploadFile, deleteFile, extractStoragePathFromUrl } from '@/lib/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, Loader2, Type } from 'lucide-react';

interface CustomFont {
  id: string;
  name: string;
  fontUrl: string;
  createdAt: string;
}

export function CustomFontsSettings() {
  const [fonts, setFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchFonts();
  }, []);

  const fetchFonts = async () => {
    try {
      const result = await api
        .from('custom_fonts')
        .select('*')
        .order('createdAt', { ascending: false });
      const { data, error } = result as { data: CustomFont[] | null; error: Error | null };

      if (error) throw error;
      setFonts(data || []);
    } catch (error) {
      console.error('Error fetching fonts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a font file (.ttf, .otf, .woff, .woff2)',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a font smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      
      const uploadResult = await uploadFile('fonts', fileName, file);

      if (uploadResult.error || !uploadResult.data) {
        throw uploadResult.error || new Error('Upload failed: No data returned');
      }

      // Use publicUrl from upload response
      const publicUrl = uploadResult.data.publicUrl;

      // Extract font name from filename (remove extension and timestamp)
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');

      const { error: dbError } = await api
        .from('custom_fonts')
        .insert({
          name: fontName,
          fontUrl: publicUrl,
        });

      if (dbError) throw dbError;

      await fetchFonts();

      toast({
        title: 'Font uploaded',
        description: `"${fontName}" has been added to your custom fonts.`,
      });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFont = async (font: CustomFont) => {
    setDeleting(font.id);
    try {
      // Extract filename from URL
      const fileName = extractStoragePathFromUrl(font.fontUrl, 'fonts');
      if (!fileName) return;
      const deleteResult = await deleteFile('fonts', fileName);
      if (deleteResult.error) {
        console.error('Failed to delete font file:', deleteResult.error);
      }

      const { error } = await api
        .from('custom_fonts')
        .eq('id', font.id)
        .delete();

      if (error) throw error;

      setFonts(prev => prev.filter(f => f.id !== font.id));

      toast({
        title: 'Font deleted',
        description: `"${font.name}" has been removed.`,
      });
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Custom Fonts</h2>
        <p className="text-muted-foreground">
          Upload custom fonts to use in your application branding.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Font</CardTitle>
          <CardDescription>
            Upload custom font files to use for your app name and tagline. Supported formats: TTF, OTF, WOFF, WOFF2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {uploading ? 'Uploading...' : 'Click to upload a font file'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              TTF, OTF, WOFF, WOFF2 (max 5MB)
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={handleFileSelect}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Installed Fonts</CardTitle>
          <CardDescription>
            Manage your uploaded custom fonts. These fonts can be selected in the Branding settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fonts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom fonts uploaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {fonts.map((font) => (
                <div
                  key={font.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Type className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{font.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(font.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteFont(font)}
                    disabled={deleting === font.id}
                  >
                    {deleting === font.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
