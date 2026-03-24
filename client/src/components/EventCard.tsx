import type { CalendarEvent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, MapPin, Clock, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";

function formatEventTime(dateStr: string) {
  const date = parseISO(dateStr);
  return format(date, "h:mm a");
}

const sourceColors: Record<string, string> = {
  google: "bg-blue-500",
  apple: "bg-gray-500",
  manual: "bg-primary",
};

interface EventCardProps {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
}

export function EventCard({ event, onEdit }: EventCardProps) {
  const accentColor = sourceColors[event.source] || event.color || "bg-primary";

  async function handleDelete() {
    await apiRequest("DELETE", `/api/events/${event.id}`);
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
  }

  return (
    <div
      className="group flex items-start gap-3 px-4 py-3"
      data-testid={`card-event-${event.id}`}
    >
      {/* Color accent bar */}
      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${accentColor}`} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" data-testid={`text-event-title-${event.id}`}>
          {event.title}
        </p>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatEventTime(event.startTime)}
            {event.endTime && ` – ${formatEventTime(event.endTime)}`}
          </span>

          {event.location && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {event.location}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {event.source === "google" && (
            event.sourceRef ? (
              <a
                href={event.sourceRef}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex"
              >
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 cursor-pointer hover:bg-muted transition-colors">
                  <ExternalLink className="w-2.5 h-2.5" />
                  Google Calendar
                </Badge>
              </a>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                Google Calendar
              </Badge>
            )
          )}
          {event.source === "manual" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              Manual
            </Badge>
          )}
        </div>

        {event.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {event.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onEdit(event)}
          data-testid={`button-edit-event-${event.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={handleDelete}
          data-testid={`button-delete-event-${event.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
