import { useState } from "react";
import type { Task } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Pencil,
  Mail,
  Calendar,
  Bell,
  FileText,
  Clock,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";

const priorityConfig = {
  high: { color: "bg-red-500", label: "High" },
  medium: { color: "bg-amber-500", label: "Medium" },
  low: { color: "bg-emerald-500", label: "Low" },
};

const sourceIcons: Record<string, typeof Mail> = {
  gmail: Mail,
  calendar: Calendar,
  reminders: Bell,
  manual: FileText,
  sms: MessageSquare,
};

// Maps source types to their external URLs
// sourceRef can store specific IDs (email ID, event ID) for deep linking
function getSourceUrl(source: string, sourceRef?: string | null): string | null {
  switch (source) {
    case "gmail":
      if (sourceRef) {
        return `https://mail.google.com/mail/u/0/#inbox/${sourceRef}`;
      }
      return "https://mail.google.com";
    case "calendar":
      if (sourceRef) {
        return `https://calendar.google.com/calendar/r/eventedit/${sourceRef}`;
      }
      return "https://calendar.google.com";
    case "reminders":
      return "https://calendar.google.com/calendar/r/reminders";
    case "manual":
      return null; // No external link for manual tasks
    default:
      return null;
  }
}

function formatDueDate(dateStr: string) {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d");
}

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
}

export function TaskCard({ task, onEdit }: TaskCardProps) {
  const [completing, setCompleting] = useState(false);

  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const SourceIcon = sourceIcons[task.source] || FileText;
  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !task.completed;
  const sourceUrl = getSourceUrl(task.source, task.sourceRef);

  async function toggleComplete() {
    setCompleting(true);
    setTimeout(async () => {
      await apiRequest("PATCH", `/api/tasks/${task.id}`, {
        completed: task.completed ? 0 : 1,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setCompleting(false);
    }, 300);
  }

  async function handleDelete() {
    await apiRequest("DELETE", `/api/tasks/${task.id}`);
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
  }

  const badgeContent = (
    <>
      <SourceIcon className="w-3 h-3 mr-1" />
      {task.source}
      {sourceUrl && <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-60" />}
    </>
  );

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 transition-all ${
        completing ? "task-completing" : ""
      } ${task.completed ? "opacity-50" : ""}`}
      data-testid={`card-task-${task.id}`}
    >
      <div className="pt-0.5">
        <Checkbox
          checked={!!task.completed}
          onCheckedChange={toggleComplete}
          className="mt-0.5"
          data-testid={`checkbox-task-${task.id}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${priority.color}`}
            title={priority.label}
          />
          <span
            className={`text-sm font-medium ${
              task.completed ? "line-through text-muted-foreground" : ""
            }`}
            data-testid={`text-task-title-${task.id}`}
          >
            {task.title}
          </span>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-source-${task.id}`}
            >
              <Badge
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-muted-foreground/20 transition-colors"
              >
                {badgeContent}
              </Badge>
            </a>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {badgeContent}
            </Badge>
          )}
        </div>

        {task.contextNote && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed" data-testid={`text-context-${task.id}`}>
            {task.contextNote}
          </p>
        )}

        <div className="flex items-center gap-3 mt-1.5">
          {task.dueDate && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
              }`}
              data-testid={`text-due-${task.id}`}
            >
              <Clock className="w-3 h-3" />
              {formatDueDate(task.dueDate)}
              {isOverdue && " (overdue)"}
            </span>
          )}
          {task.urgencyScore !== null && task.urgencyScore !== undefined && (
            <span className="text-xs text-muted-foreground">
              Urgency: {task.urgencyScore.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onEdit(task)}
          data-testid={`button-edit-task-${task.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={handleDelete}
          data-testid={`button-delete-task-${task.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
