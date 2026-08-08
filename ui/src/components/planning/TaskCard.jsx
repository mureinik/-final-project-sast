import React from 'react';
import { Calendar, ArrowUpRight, Layers, BookOpen, CheckSquare } from 'lucide-react';
import { format } from 'date-fns';

const priorityConfig = {
  high:   { dot: 'bg-destructive', label: 'High',   class: 'text-destructive' },
  medium: { dot: 'bg-chart-4',     label: 'Medium', class: 'text-chart-4' },
  low:    { dot: 'bg-muted-foreground', label: 'Low', class: 'text-muted-foreground' },
};

const assigneeConfig = {
  zohar: { avatar: 'Z', color: 'bg-primary/20 text-primary' },
  or:    { avatar: 'O', color: 'bg-secondary/20 text-secondary' },
  both:  { avatar: 'B', color: 'bg-accent/20 text-accent' },
};

const categoryColors = {
  research:     'bg-secondary/10 text-secondary',
  development:  'bg-primary/10 text-primary',
  writing:      'bg-chart-5/10 text-chart-5',
  presentation: 'bg-accent/10 text-accent',
  testing:      'bg-chart-4/10 text-chart-4',
};

const typeConfig = {
  epic:  { icon: Layers,      color: 'text-secondary',        border: 'border-secondary/30',  bg: 'bg-secondary/5'  },
  story: { icon: BookOpen,    color: 'text-accent',           border: 'border-accent/30',     bg: 'bg-accent/5'     },
  task:  { icon: CheckSquare, color: 'text-muted-foreground', border: 'border-border/50',     bg: 'bg-card'         },
};

export default function TaskCard({ task, onClick }) {
  const priority = priorityConfig[task.priority] ?? priorityConfig.medium;
  const assignee = assigneeConfig[task.assigned_to] ?? assigneeConfig.both;
  const tc = typeConfig[task.type] ?? typeConfig.task;
  const TypeIcon = tc.icon;

  return (
    <div
      onClick={onClick}
      className={`group border rounded-lg p-3 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer ${tc.bg} ${tc.border}`}
    >
      {/* Type badge row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <TypeIcon className={`w-3 h-3 shrink-0 ${tc.color}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${tc.color}`}>
          {task.type === 'story' ? 'User Story' : task.type || 'task'}
        </span>
        <ArrowUpRight className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground ml-auto transition-colors" />
      </div>

      <p className="text-sm font-medium leading-snug mb-2">{task.title}</p>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">{task.description}</p>
      )}

      {task.category && (
        <div className="mb-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${categoryColors[task.category] ?? 'bg-muted text-muted-foreground'}`}>
            {task.category}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${priority.dot}`} />
            <span className={priority.class}>{priority.label}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <Calendar className="w-2.5 h-2.5" />
              <span>{format(new Date(task.due_date), 'MMM d')}</span>
            </div>
          )}
        </div>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${assignee.color}`}>
          {assignee.avatar}
        </div>
      </div>
    </div>
  );
}