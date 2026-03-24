import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Task, CalendarEvent } from "@shared/schema";
import { TaskCard } from "@/components/TaskCard";
import { TaskForm } from "@/components/TaskForm";
import { EventCard } from "@/components/EventCard";
import { EventForm } from "@/components/EventForm";
import { VoiceInput } from "@/components/VoiceInput";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  parseISO,
  format,
  isToday,
  isTomorrow,
  startOfWeek,
  endOfWeek,
  isBefore,
  isAfter,
  isEqual,
} from "date-fns";
import {
  Plus,
  CheckCircle2,
  Calendar,
  RefreshCw,
  AlertTriangle,
  Clock,
  TrendingUp,
} from "lucide-react";

type TaskFilter = "all" | "today" | "pending" | "completed";

function dayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, MMM d");
}

function groupByDate<T>(items: T[], getDate: (item: T) => string | null): { date: string; items: T[] }[] {
  const grouped = new Map<string, T[]>();
  const noDate: T[] = [];

  for (const item of items) {
    const d = getDate(item);
    if (!d) {
      noDate.push(item);
      continue;
    }
    const key = d.split("T")[0] || d;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  const sorted = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));

  if (noDate.length > 0) {
    sorted.push({ date: "no-date", items: noDate });
  }

  return sorted;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TasksPage() {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("pending");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [syncing, setSyncing] = useState(false);

  const taskFilterParam = taskFilter === "all" ? "" : `?filter=${taskFilter}`;
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", taskFilterParam],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tasks${taskFilterParam}`);
      return res.json();
    },
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/events");
      return res.json();
    },
  });

  const { data: stats } = useQuery<{
    total: number;
    pending: number;
    completed: number;
    dueToday: number;
    overdue: number;
    highPriority: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const thisWeekEvents = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

    const inWeek = events.filter((e) => {
      const d = parseISO(e.startTime);
      return (isAfter(d, weekStart) || isEqual(d, weekStart)) &&
             (isBefore(d, weekEnd) || isEqual(d, weekEnd));
    });

    const seen = new Set<string>();
    const deduped: CalendarEvent[] = [];
    for (const e of inWeek) {
      const titleKey = e.title.trim().toLowerCase();
      if (seen.has(titleKey)) continue;
      seen.add(titleKey);
      deduped.push(e);
    }

    return deduped;
  }, [events]);

  const eventsByDay = useMemo(
    () => groupByDate(thisWeekEvents, (e) => e.startTime),
    [thisWeekEvents]
  );

  const tasksByDay = useMemo(
    () => groupByDate(tasks, (t) => t.dueDate),
    [tasks]
  );

  async function handleSync() {
    setSyncing(true);
    try {
      await apiRequest("POST", "/api/events/sync");
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  }

  function handleEdit(task: Task) {
    setEditTask(task);
    setTaskFormOpen(true);
  }

  function handleCloseTask() {
    setTaskFormOpen(false);
    setEditTask(null);
  }

  function handleEditEvent(event: CalendarEvent) {
    setEditEvent(event);
    setEventFormOpen(true);
  }

  function handleCloseEvent() {
    setEventFormOpen(false);
    setEditEvent(null);
  }

  const taskFilters: { key: TaskFilter; label: string; count?: number }[] = [
    { key: "pending", label: "Upcoming", count: stats?.pending },
    { key: "today", label: "Today", count: stats?.dueToday },
    { key: "completed", label: "Done", count: stats?.completed },
    { key: "all", label: "All", count: stats?.total },
  ];

  const statCards = [
    { label: "Pending", value: stats?.pending ?? "-", icon: Clock, color: "text-blue-500" },
    { label: "Due Today", value: stats?.dueToday ?? "-", icon: TrendingUp, color: "text-amber-500" },
    { label: "Overdue", value: stats?.overdue ?? "-", icon: AlertTriangle, color: "text-red-500" },
    { label: "Completed", value: stats?.completed ?? "-", icon: CheckCircle2, color: "text-emerald-500" },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="px-4 sm:px-6 pt-5 pb-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              {getGreeting()}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(), "EEEE, MMMM d")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <VoiceInput onTaskCreated={() => {}} />
            <Button size="sm" onClick={() => setTaskFormOpen(true)} data-testid="button-add-task">
              <Plus className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Add Task</span>
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border bg-card px-3 py-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-xl font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        {/* =================== TASKS SECTION =================== */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Tasks</h2>
            {/* Filters */}
            <div className="flex items-center gap-1">
              {taskFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTaskFilter(f.key)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    taskFilter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  data-testid={`button-filter-${f.key}`}
                >
                  {f.label}
                  {f.count !== undefined && (
                    <span className="ml-1 opacity-70">{f.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            {tasksLoading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-3">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {taskFilter === "completed"
                    ? "No completed tasks yet"
                    : taskFilter === "today"
                    ? "Nothing due today"
                    : "No tasks yet — add one to get started"}
                </p>
              </div>
            ) : (
              <div>
                {tasksByDay.map((group) => (
                  <div key={group.date}>
                    <div className="px-4 pt-3 pb-1.5">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group.date === "no-date" ? "No Due Date" : dayLabel(group.date)}
                      </h3>
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((task) => (
                        <TaskCard key={task.id} task={task} onEdit={handleEdit} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* =================== CALENDAR SECTION =================== */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">This Week</h2>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSync}
                disabled={syncing}
                data-testid="button-sync-calendar"
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEventFormOpen(true)}
                data-testid="button-add-event"
              >
                <Plus className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Add Event</span>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            {eventsLoading ? (
              <div className="space-y-1 p-2">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-3">
                    <Skeleton className="w-1 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : thisWeekEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Calendar className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No events this week
                </p>
              </div>
            ) : (
              <div>
                {eventsByDay.map((group) => (
                  <div key={group.date}>
                    <div className="px-4 pt-3 pb-1.5">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {dayLabel(group.date)}
                      </h3>
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((event) => (
                        <EventCard key={event.id} event={event} onEdit={handleEditEvent} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <TaskForm open={taskFormOpen} onClose={handleCloseTask} editTask={editTask} />
      <EventForm open={eventFormOpen} onClose={handleCloseEvent} editEvent={editEvent} />
    </ScrollArea>
  );
}
