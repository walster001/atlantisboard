import { useState, useEffect } from 'react';
import { Card, Label, LabelColor } from '@/types/kanban';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label as UILabel } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, X, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CardEditDialogProps {
  card: Card | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Card>) => void;
  onAddLabel: (label: Label) => void;
  onRemoveLabel: (labelId: string) => void;
}

const labelColors: { color: LabelColor; name: string; className: string }[] = [
  { color: 'red', name: 'Red', className: 'bg-label-red' },
  { color: 'orange', name: 'Orange', className: 'bg-label-orange' },
  { color: 'yellow', name: 'Yellow', className: 'bg-label-yellow' },
  { color: 'green', name: 'Green', className: 'bg-label-green' },
  { color: 'blue', name: 'Blue', className: 'bg-label-blue' },
  { color: 'purple', name: 'Purple', className: 'bg-label-purple' },
  { color: 'pink', name: 'Pink', className: 'bg-label-pink' },
];

export function CardEditDialog({
  card,
  open,
  onClose,
  onSave,
  onAddLabel,
  onRemoveLabel,
}: CardEditDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabelText, setNewLabelText] = useState('');

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description || '');
      setDueDate(card.dueDate ? new Date(card.dueDate) : undefined);
    }
  }, [card]);

  const handleSave = () => {
    onSave({
      title,
      description: description || undefined,
      dueDate: dueDate?.toISOString(),
    });
    onClose();
  };

  const handleAddLabel = (color: LabelColor) => {
    const newLabel: Label = {
      id: Math.random().toString(36).substr(2, 9),
      color,
      text: newLabelText || undefined,
    };
    onAddLabel(newLabel);
    setNewLabelText('');
    setShowLabelPicker(false);
  };

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Card</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <UILabel htmlFor="title">Title</UILabel>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <UILabel htmlFor="description">Description</UILabel>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a more detailed description..."
              rows={4}
            />
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <UILabel>Labels</UILabel>
            <div className="flex flex-wrap gap-2">
              {card.labels.map((label) => (
                <span
                  key={label.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white',
                    labelColors.find((l) => l.color === label.color)?.className
                  )}
                >
                  {label.text || label.color}
                  <button
                    onClick={() => onRemoveLabel(label.id)}
                    className="hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <Popover open={showLabelPicker} onOpenChange={setShowLabelPicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7">
                    <Tag className="h-3 w-3 mr-1" />
                    Add Label
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="start">
                  <div className="space-y-3">
                    <Input
                      value={newLabelText}
                      onChange={(e) => setNewLabelText(e.target.value)}
                      placeholder="Label text (optional)"
                      className="h-8"
                    />
                    <div className="grid grid-cols-7 gap-1">
                      {labelColors.map((label) => (
                        <button
                          key={label.color}
                          onClick={() => handleAddLabel(label.color)}
                          className={cn(
                            'h-6 w-full rounded hover:ring-2 hover:ring-offset-1 hover:ring-foreground/20 transition-all',
                            label.className
                          )}
                          title={label.name}
                        />
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <UILabel>Due Date</UILabel>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {dueDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDueDate(undefined)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
