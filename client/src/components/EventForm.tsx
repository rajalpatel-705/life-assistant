import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CalendarEvent } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

const eventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().optional(),
  location: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

function extractDate(isoStr: string): string {
  return isoStr.split("T")[0] || "";
}

function extractTime(isoStr: string): string {
  const timePart = isoStr.split("T")[1];
  if (!timePart) return "";
  return timePart.substring(0, 5); // "HH:MM"
}

interface EventFormProps {
  open: boolean;
  onClose: () => void;
  editEvent?: CalendarEvent | null;
}

export function EventForm({ open, onClose, editEvent }: EventFormProps) {
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      date: "",
      startTime: "",
      endTime: "",
      location: "",
    },
  });

  // Reset form values whenever editEvent changes or dialog opens
  useEffect(() => {
    if (open) {
      if (editEvent) {
        form.reset({
          title: editEvent.title,
          date: extractDate(editEvent.startTime),
          startTime: extractTime(editEvent.startTime),
          endTime: editEvent.endTime ? extractTime(editEvent.endTime) : "",
          location: editEvent.location || "",
        });
      } else {
        form.reset({
          title: "",
          date: "",
          startTime: "",
          endTime: "",
          location: "",
        });
      }
    }
  }, [open, editEvent, form]);

  async function onSubmit(values: EventFormValues) {
    const startISO = `${values.date}T${values.startTime}:00`;
    const endISO = values.endTime ? `${values.date}T${values.endTime}:00` : null;

    const payload = {
      title: values.title,
      startTime: startISO,
      endTime: endISO,
      location: values.location || null,
      source: editEvent?.source || "manual",
    };

    if (editEvent) {
      await apiRequest("PATCH", `/api/events/${editEvent.id}`, payload);
    } else {
      await apiRequest("POST", "/api/events", payload);
    }

    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    form.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-event-form">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {editEvent ? "Edit Event" : "New Event"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Event name"
                      {...field}
                      data-testid="input-event-title"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-event-date" />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-event-start" />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-muted-foreground">End Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-event-end" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium text-muted-foreground">Location</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Where is it?"
                      {...field}
                      data-testid="input-event-location"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} data-testid="button-cancel-event">
                Cancel
              </Button>
              <Button type="submit" data-testid="button-save-event">
                {editEvent ? "Save Changes" : "Add Event"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
