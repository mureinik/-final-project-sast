import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Loader2, Calendar, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const statusIcon = { done: CheckCircle2, in_progress: Loader2, todo: Circle };
const statusColor = { done: 'text-primary', in_progress: 'text-chart-4', todo: 'text-muted-foreground' };
const statusBg = { done: 'bg-primary/10 border-primary/20', in_progress: 'bg-chart-4/10 border-chart-4/20', todo: 'bg-muted/30 border-border/30' };
const priorityDot = { high: 'bg-destructive', medium: 'bg-chart-4', low: 'bg-muted-foreground' };
const assigneeColor = { zohar: 'bg-primary/20 text-primary', or: 'bg-secondary/20 text-secondary', both: 'bg-accent/20 text-accent' };
const assigneeInitial = { zohar: 'Z', or: 'O', both: 'B' };

const categoryColors = {
  research: 'bg-secondary/10 text-secondary border-secondary/20',
  development: 'bg-primary/10 text-primary border-primary/20',
  writing: 'bg-chart-5/10 text-chart-5 border-chart-5/20',
  presentation: 'bg-accent/10 text-accent border-accent/20',
  testing: 'bg-chart-4/10 text-chart-4 border-chart-4/20',
};

function TaskRow({ task }) {
  const Icon = statusIcon[task.status] ?? Circle;
  const color = statusColor[task.status];
  const bg = statusBg[task.status];

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${bg} text-sm`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color} ${task.status === 'in_progress' ? 'animate-spin' : ''}`} />
      <span className={`flex-1 text-xs ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {task.title}
      </span>
      {task.category && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium hidden sm:block ${categoryColors[task.category] ?? ''}`}>
          {task.category}
        </span>
      )}
      {task.priority && (
        <div className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[task.priority]}`} title={task.priority} />
      )}
      {task.assigned_to && (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${assigneeColor[task.assigned_to]}`}>
          {assigneeInitial[task.assigned_to]}
        </div>
      )}
      {task.due_date && (
        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
          <Calendar className="w-2.5 h-2.5" />
          {format(new Date(task.due_date), 'MMM d')}
        </div>
      )}
    </div>
  );
}

function EpicBlock({ epic, stories, tasks }) {
  const epicStories = stories.filter(s => s.epic_id === epic.id);
  const epicTasks = tasks.filter(t => t.epic_id === epic.id);
  const allItems = [...epicStories, ...epicTasks];
  const done = allItems.filter(i => i.status === 'done').length;
  const total = allItems.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      {/* Epic header */}
      <div className="px-4 py-3 bg-secondary/10 border-b border-secondary/20 flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-sm bg-secondary shrink-0" />
        <span className="text-sm font-bold text-secondary flex-1">{epic.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{done}/{total} done</span>
          <div className="w-20">
            <Progress value={progress} className="h-1.5" />
          </div>
          <span className="text-[10px] font-semibold text-secondary">{progress}%</span>
        </div>
      </div>

      {/* Stories + their tasks */}
      <div className="p-3 space-y-3">
        {epicStories.map(story => {
          const storyTasks = tasks.filter(t => t.story_id === story.id);
          const sDone = storyTasks.filter(t => t.status === 'done').length + (story.status === 'done' ? 0 : 0);
          const sTotal = storyTasks.length;
          const sProgress = sTotal > 0 ? Math.round((storyTasks.filter(t => t.status === 'done').length / sTotal) * 100) : (story.status === 'done' ? 100 : 0);

          return (
            <div key={story.id} className="border border-border/30 rounded-lg overflow-hidden">
              {/* Story header */}
              <div className="px-3 py-2 bg-accent/5 border-b border-accent/15 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                <span className="text-xs font-semibold text-accent flex-1">{story.title}</span>
                {sTotal > 0 && (
                  <span className="text-[10px] text-muted-foreground">{storyTasks.filter(t => t.status === 'done').length}/{sTotal} tasks</span>
                )}
                <div className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${statusBg[story.status]} ${statusColor[story.status]} border`}>
                  {story.status.replace('_', ' ')}
                </div>
              </div>
              {/* Story tasks */}
              {storyTasks.length > 0 && (
                <div className="p-2 space-y-1.5">
                  {storyTasks.map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              {storyTasks.length === 0 && (
                <p className="text-[10px] text-muted-foreground/40 px-3 py-2 italic">No tasks under this story yet</p>
              )}
            </div>
          );
        })}

        {/* Tasks directly under epic (no story) */}
        {epicTasks.filter(t => !t.story_id).length > 0 && (
          <div className="space-y-1.5">
            {epicTasks.filter(t => !t.story_id).map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        )}

        {allItems.length === 0 && (
          <p className="text-[10px] text-muted-foreground/40 italic px-1">No stories or tasks under this epic yet</p>
        )}
      </div>
    </div>
  );
}

export default function ProgressView({ tasks }) {
  const epics = tasks.filter(t => t.type === 'epic');
  const stories = tasks.filter(t => t.type === 'story');
  const plainTasks = tasks.filter(t => t.type === 'task' || !t.type);

  const totalTasks = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const todo = tasks.filter(t => t.status === 'todo').length;
  const overallProgress = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;

  // Orphan tasks (no epic, no story)
  const orphanTasks = plainTasks.filter(t => !t.story_id && !t.epic_id);
  const orphanStories = stories.filter(s => !s.epic_id);

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* Overall progress bar */}
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Overall Project Progress</span>
          <span className="ml-auto text-lg font-bold text-primary">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-3 mb-3" />
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-muted-foreground">{done} Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-chart-4" />
            <span className="text-muted-foreground">{inProgress} In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">{todo} To Do</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-muted-foreground">{totalTasks} total items</span>
          </div>
        </div>
      </div>

      {/* Epics breakdown */}
      {epics.map(epic => (
        <EpicBlock key={epic.id} epic={epic} stories={stories} tasks={plainTasks} />
      ))}

      {/* Orphan stories (no epic) */}
      {orphanStories.length > 0 && (
        <div className="border border-border/40 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border/30">
            <span className="text-xs font-semibold text-muted-foreground">Stories (no epic)</span>
          </div>
          <div className="p-3 space-y-1.5">
            {orphanStories.map(s => <TaskRow key={s.id} task={s} />)}
          </div>
        </div>
      )}

      {/* Orphan tasks (no epic, no story) */}
      {orphanTasks.length > 0 && (
        <div className="border border-border/40 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-muted/30 border-b border-border/30">
            <span className="text-xs font-semibold text-muted-foreground">Tasks (no epic / story)</span>
          </div>
          <div className="p-3 space-y-1.5">
            {orphanTasks.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-16 text-muted-foreground/40 text-sm">
          No items yet — create an Epic to get started
        </div>
      )}
    </div>
  );
}