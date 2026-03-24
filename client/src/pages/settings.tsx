import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Save,
  Mail,
  Calendar,
  Bell,
  Key,
  User,
  Clock,
  Phone,
  MessageSquare,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  RefreshCw,
} from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();

  const { data: settingsData = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  useEffect(() => {
    setForm(settingsData);
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/settings", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const tokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/generate-token");
      return res.json();
    },
    onSuccess: (data: { token: string }) => {
      setGeneratedToken(data.token);
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "API token generated" });
    },
  });

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function copyToken() {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      toast({ title: "Token copied to clipboard" });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-settings-title">Settings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure SMS, integrations, and briefing delivery
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 sm:px-6 pb-6">
        <div className="space-y-5 max-w-2xl">
          {/* SMS / Twilio - Primary integration */}
          <Card className="p-4 border-primary/20" data-testid="section-sms">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">SMS Integration</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Text tasks to your Twilio number. They show up instantly in your dashboard.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Your Phone Number</Label>
                <Input
                  type="tel"
                  value={form.phoneNumber || ""}
                  onChange={(e) => update("phoneNumber", e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="mt-1"
                  data-testid="input-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">Include country code (e.g., +1). Used to verify incoming texts.</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Twilio Account SID</Label>
                <Input
                  type="password"
                  value={form.twilioSid || ""}
                  onChange={(e) => update("twilioSid", e.target.value)}
                  placeholder="AC..."
                  className="mt-1 font-mono text-xs"
                  data-testid="input-twilioSid"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Twilio Auth Token</Label>
                <Input
                  type="password"
                  value={form.twilioToken || ""}
                  onChange={(e) => update("twilioToken", e.target.value)}
                  placeholder="Auth token"
                  className="mt-1 font-mono text-xs"
                  data-testid="input-twilioToken"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Twilio Phone Number</Label>
                <Input
                  type="tel"
                  value={form.twilioPhone || ""}
                  onChange={(e) => update("twilioPhone", e.target.value)}
                  placeholder="+1..."
                  className="mt-1"
                  data-testid="input-twilioPhone"
                />
                <p className="text-xs text-muted-foreground mt-1">This is the number you'll text to add tasks.</p>
              </div>
            </div>
          </Card>

          {/* Account */}
          <Card className="p-4" data-testid="section-account">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Account</h2>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Your Name</Label>
                <Input
                  value={form.userName || ""}
                  onChange={(e) => update("userName", e.target.value)}
                  placeholder="Used in briefing greetings"
                  className="mt-1"
                  data-testid="input-user-name"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  type="email"
                  value={form.userEmail || ""}
                  onChange={(e) => update("userEmail", e.target.value)}
                  placeholder="Where to send briefings"
                  className="mt-1"
                  data-testid="input-user-email"
                />
              </div>
            </div>
          </Card>

          {/* Morning Briefing */}
          <Card className="p-4" data-testid="section-briefing">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Morning Briefing</h2>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Delivery Time</Label>
                <Input
                  type="time"
                  value={form.briefingTime || "08:30"}
                  onChange={(e) => update("briefingTime", e.target.value)}
                  className="mt-1 w-40"
                  data-testid="input-briefing-time"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">SMS delivery</p>
                  <p className="text-xs text-muted-foreground">Morning text with your top tasks</p>
                </div>
                <Switch
                  checked={form.briefingSms === "true"}
                  onCheckedChange={(checked) =>
                    update("briefingSms", checked ? "true" : "false")
                  }
                  data-testid="switch-briefing-sms"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Email delivery</p>
                  <p className="text-xs text-muted-foreground">HTML-formatted briefing to your email</p>
                </div>
                <Switch
                  checked={form.briefingEmail !== "false"}
                  onCheckedChange={(checked) =>
                    update("briefingEmail", checked ? "true" : "false")
                  }
                  data-testid="switch-briefing-email"
                />
              </div>
            </div>
          </Card>

          {/* Integrations */}
          <Card className="p-4" data-testid="section-integrations">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Integrations</h2>
            </div>
            <div className="space-y-3">
              {[
                { name: "Gmail", icon: Mail, key: "gmailConnected", desc: "Read emails, detect actionable items" },
                { name: "Google Calendar", icon: Calendar, key: "calendarConnected", desc: "Read upcoming events" },
                { name: "Apple Reminders", icon: Bell, key: "remindersConnected", desc: "Sync reminders via CalDAV" },
              ].map((integration) => (
                <div key={integration.key} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <integration.icon className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">{integration.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {form[integration.key] === "true" ? (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <XCircle className="w-3 h-3 mr-1" />
                        Not connected
                      </Badge>
                    )}
                    <Switch
                      checked={form[integration.key] === "true"}
                      onCheckedChange={(checked) =>
                        update(integration.key, checked ? "true" : "false")
                      }
                      data-testid={`switch-${integration.key}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* API Token */}
          <Card className="p-4" data-testid="section-api-token">
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">API Token</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Generate a token to add tasks from external tools (Shortcuts, automations, etc.)
            </p>
            <div className="space-y-3">
              {generatedToken && (
                <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
                  <code className="text-xs font-mono flex-1 truncate">{generatedToken}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyToken}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => tokenMutation.mutate()}
                disabled={tokenMutation.isPending}
              >
                {tokenMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Generate New Token
              </Button>
            </div>
          </Card>

          {/* Other API Keys */}
          <Card className="p-4" data-testid="section-api-keys">
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Other API Keys</h2>
            </div>
            <div className="space-y-3">
              {[
                { key: "anthropicKey", label: "Anthropic API Key", placeholder: "sk-ant-..." },
                { key: "braveKey", label: "Brave Search API Key", placeholder: "BSA..." },
              ].map((field) => (
                <div key={field.key}>
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  <Input
                    type="password"
                    value={form[field.key] || ""}
                    onChange={(e) => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="mt-1 font-mono text-xs"
                    data-testid={`input-${field.key}`}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
