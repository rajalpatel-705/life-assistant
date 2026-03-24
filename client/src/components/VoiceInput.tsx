import { useState, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface VoiceInputProps {
  onTaskCreated: () => void;
}

export function VoiceInput({ onTaskCreated }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [parsedTask, setParsedTask] = useState<{
    title: string;
    priority: string;
    dueDate: string;
  } | null>(null);
  const recognitionRef = useRef<any>(null);

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const result = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setTranscript(result);
    };

    recognition.onend = () => {
      setListening(false);
      if (transcript) {
        parseTranscript(transcript);
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setTranscript("");
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  }

  function parseTranscript(text: string) {
    setProcessing(true);
    const lower = text.toLowerCase();

    let priority = "medium";
    if (lower.includes("high priority") || lower.includes("urgent")) priority = "high";
    if (lower.includes("low priority")) priority = "low";

    let dueDate = "";
    const today = new Date();
    if (lower.includes("tomorrow")) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      dueDate = d.toISOString().split("T")[0];
    } else if (lower.includes("today")) {
      dueDate = today.toISOString().split("T")[0];
    } else if (lower.includes("next week")) {
      const d = new Date(today);
      d.setDate(d.getDate() + 7);
      dueDate = d.toISOString().split("T")[0];
    }

    // Clean up title
    let title = text
      .replace(/remind me to /i, "")
      .replace(/add a (high|medium|low) priority task to /i, "")
      .replace(/add a task to /i, "")
      .replace(/ by tomorrow| by today| by next week/i, "")
      .replace(/ tomorrow| today/i, "")
      .trim();

    title = title.charAt(0).toUpperCase() + title.slice(1);

    setParsedTask({ title, priority, dueDate });
    setShowPreview(true);
    setProcessing(false);
  }

  async function confirmTask() {
    if (!parsedTask) return;
    setProcessing(true);
    await apiRequest("POST", "/api/tasks", {
      title: parsedTask.title,
      priority: parsedTask.priority,
      dueDate: parsedTask.dueDate || null,
      source: "manual",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    setShowPreview(false);
    setParsedTask(null);
    setTranscript("");
    setProcessing(false);
    onTaskCreated();
  }

  return (
    <>
      <Button
        size="icon"
        variant={listening ? "destructive" : "secondary"}
        onClick={listening ? stopListening : startListening}
        disabled={processing}
        data-testid="button-voice-input"
      >
        {processing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : listening ? (
          <MicOff className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>

      {listening && (
        <span className="text-xs text-muted-foreground animate-pulse">
          Listening...{transcript && ` "${transcript}"`}
        </span>
      )}

      <Dialog open={showPreview} onOpenChange={(o) => !o && setShowPreview(false)}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-voice-preview">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Confirm Task</DialogTitle>
          </DialogHeader>
          {parsedTask && (
            <div className="space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">Title</span>
                <p className="text-sm font-medium" data-testid="text-voice-title">{parsedTask.title}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <p className="text-sm capitalize">{parsedTask.priority}</p>
                </div>
                {parsedTask.dueDate && (
                  <div>
                    <span className="text-xs text-muted-foreground">Due</span>
                    <p className="text-sm">{parsedTask.dueDate}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowPreview(false)} data-testid="button-voice-cancel">
                  Cancel
                </Button>
                <Button onClick={confirmTask} disabled={processing} data-testid="button-voice-confirm">
                  Add Task
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
