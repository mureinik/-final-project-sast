import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calendar, Trash2, Layers, BookOpen, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';

const typeConfig = {
  epic:  { label: 'Epic',       icon: Layers,      color: 'text-secondary' },
  story: { label: 'User Story', icon: BookOpen,    color: 'text-accent' },
  task:  { label: 'Task',       icon: CheckSquare, color: 'text-muted-foreground' },
};

export default function TaskDetailDialog({ task, onClose, onUpdate, onDelete }) {
  const [status,   setStatus]   = useState('todo');
  const [assignee, setAssignee] = useState('both');
  const [priority, setPriority] = useState('medium');

  useEffect(() => {
    if (task) {
      setStatus(task.status || 'todo');
      setAssignee(task.assigned_to || 'both');
      setPriority(task.priority || 'medium');
    }
  }, [task]);

  if (!task) return null;

  const tc = typeConfig[task.type] ?? typeConfig.task;
  const TypeIcon = tc.icon;

  const handleSave = () => {
    onUpdate(task.id, { status, assigned_to: assignee, priority });
    onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border/60 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <TypeIcon className={`w-4 h-4 ${tc.color}`} />
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${tc.color}`}>{tc.label}</span>
          </div>
          <DialogTitle className="text-base pr-6">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          {task.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-background h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="bg-background h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zohar">Zohar</SelectItem>
                  <SelectItem value="or">Or</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="bg-background h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {task.due_date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Due {format(new Date(task.due_date), 'MMM d, yyyy')}</span>
              </div>
            )}
            {task.category && (
              <Badge variant="outline" className="text-[10px]">{task.category}</Badge>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} size="sm" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs">
              Save Changes
            </Button>
            <Button
              onClick={() => { onDelete(task.id); onClose(); }}
              size="sm"
              variant="outline"
              className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}