import { useQuery, useMutation } from "@tanstack/react-query";
import type { Briefing } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Newspaper,
  Send,
  Mail,
  MessageSquare,
  Loader2,
  Calendar,
} from "lucide-react";
import { format, parseISO } from "date-fns";

export default function BriefingsPage() {
  const { data: briefings = [], isLoading } = useQuery<Briefing[]>({
    queryKey: ["/api/briefings"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/briefings/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/briefings"] });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-briefings-title">Briefings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily summaries of your tasks and priorities
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-briefing"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            Test Briefing
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6 pb-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-1/3 mb-3" />
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-4/5 mb-2" />
                <Skeleton className="h-3 w-2/3" />
              </Card>
            ))}
          </div>
        ) : briefings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Newspaper className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">No briefings yet</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Generate a test briefing to preview your morning summary, or wait for the scheduled 8:30am delivery.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {briefings.map((briefing) => (
              <Card key={briefing.id} className="p-4" data-testid={`card-briefing-${briefing.id}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {format(parseISO(briefing.date), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={briefing.deliveredEmail ? "default" : "secondary"}
                      className="text-xs"
                    >
                      <Mail className="w-3 h-3 mr-1" />
                      {briefing.deliveredEmail ? "Sent" : "Draft"}
                    </Badge>
                    <Badge
                      variant={briefing.deliveredSms ? "default" : "secondary"}
                      className="text-xs"
                    >
                      <MessageSquare className="w-3 h-3 mr-1" />
                      {briefing.deliveredSms ? "Sent" : "Draft"}
                    </Badge>
                  </div>
                </div>

                {briefing.contentEmail && (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert text-sm"
                    dangerouslySetInnerHTML={{ __html: briefing.contentEmail }}
                    data-testid={`text-briefing-content-${briefing.id}`}
                  />
                )}

                {briefing.contentSms && (
                  <details className="mt-3">
                    <summary className="text-xs text-muted-foreground cursor-pointer">
                      SMS version
                    </summary>
                    <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap bg-muted p-2 rounded-md">
                      {briefing.contentSms}
                    </pre>
                  </details>
                )}

                <p className="text-xs text-muted-foreground mt-3">
                  Generated {format(parseISO(briefing.createdAt), "h:mm a")}
                </p>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
