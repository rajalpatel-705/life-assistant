import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, insertCalendarEventSchema } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";

// Bearer token auth middleware for external API access
async function requireToken(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing bearer token" });
  }
  const token = auth.slice(7);
  const stored = await storage.getSetting("quickAddToken");
  if (!stored || !stored.value || token !== stored.value) {
    return res.status(403).json({ message: "Invalid token" });
  }
  next();
}

// Parse natural language task input into structured data
function parseTaskText(text: string): { title: string; priority: string; dueDate: string | null } {
  const lower = text.toLowerCase();

  let priority = "medium";
  if (lower.includes("high priority") || lower.includes("urgent") || lower.includes("!")) priority = "high";
  if (lower.includes("low priority")) priority = "low";

  let dueDate: string | null = null;
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
    .replace(/add (a )?task (to )?/i, "")
    .replace(/ ?(by |due )?(tomorrow|today|next week)/i, "")
    .replace(/ ?(high|low) priority/i, "")
    .replace(/urgent(ly)?/i, "")
    .replace(/!/g, "")
    .trim();

  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, priority, dueDate };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // =================== QUICK ADD (external, token-protected) ===================

  app.post("/api/quick-add", requireToken, async (req, res) => {
    try {
      let text = "";
      if (typeof req.body === "string") {
        text = req.body;
      } else if (req.body?.text) {
        text = req.body.text;
      } else if (req.body?.title) {
        // Allow structured input too
        const task = await storage.createTask({
          title: req.body.title,
          priority: req.body.priority || "medium",
          dueDate: req.body.dueDate || null,
          source: "sms",
        });
        return res.status(201).json(task);
      }

      if (!text.trim()) {
        return res.status(400).json({ message: "No task text provided" });
      }

      const parsed = parseTaskText(text);
      const task = await storage.createTask({
        title: parsed.title,
        priority: parsed.priority,
        dueDate: parsed.dueDate,
        source: "sms",
      });

      res.status(201).json(task);
    } catch (error) {
      console.error("Quick add error:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Generate a new quick-add token
  app.post("/api/settings/generate-token", async (_req, res) => {
    try {
      const token = crypto.randomBytes(24).toString("base64url");
      await storage.setSetting("quickAddToken", token);
      res.json({ token });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate token" });
    }
  });

  // =================== SMS (Twilio Webhook) ===================

  app.post("/api/sms/webhook", async (req, res) => {
    try {
      const body = req.body?.Body?.trim() || "";
      const from = req.body?.From || "";
      const lower = body.toLowerCase();

      // Verify the sender matches the configured phone number
      const allowedPhone = await storage.getSetting("phoneNumber");
      if (allowedPhone?.value && from !== allowedPhone.value) {
        return res.type("text/xml").send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Unauthorized number.</Message></Response>`
        );
      }

      const userName = (await storage.getSetting("userName"))?.value || "";
      let reply = "";

      // --- "what do i have" / "what's on my plate" / "status" / "tasks" ---
      if (/^(status|tasks|summary|what('?s| do i have| is))/i.test(lower) || lower === "list") {
        const pending = await storage.getPendingTasks();
        if (pending.length === 0) {
          reply = "You're all caught up! Nothing on the list right now.";
        } else {
          const lines = pending.slice(0, 8).map((t, i) => {
            let line = `${i + 1}. ${t.title}`;
            if (t.priority === "high") line += " *";
            if (t.dueDate) {
              const today = new Date().toISOString().split("T")[0];
              const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
              if (t.dueDate === today) line += " - today";
              else if (t.dueDate === tomorrow) line += " - tomorrow";
              else line += ` - ${t.dueDate}`;
            }
            return line;
          });
          reply = `Here's your list:\n\n${lines.join("\n")}`;
          if (pending.length > 8) reply += `\n\n+ ${pending.length - 8} more`;
          reply += "\n\nReply \"done #\" to check one off!";
        }

      // --- "done X" / "finished X" / "completed X" ---
      } else if (/^(done|finished|completed|check off|crossed off)\s/i.test(lower)) {
        const query = body.replace(/^(done|finished|completed|check off|crossed off)\s+/i, "").trim();
        const pending = await storage.getPendingTasks();

        const num = parseInt(query);
        let matched = null;
        if (!isNaN(num) && num >= 1 && num <= pending.length) {
          matched = pending[num - 1];
        } else {
          matched = pending.find(t =>
            t.title.toLowerCase().includes(query.toLowerCase())
          );
        }

        if (matched) {
          await storage.updateTask(matched.id, { completed: 1 });
          const remaining = pending.length - 1;
          if (remaining === 0) {
            reply = `"${matched.title}" is done! That was the last one - you're all caught up!`;
          } else {
            reply = `"${matched.title}" - done! ${remaining} left to go.`;
          }
        } else {
          reply = `Hmm, I can't find "${query}" on your list. Text "tasks" to see what's there.`;
        }

      // --- "today" / "what's due today" ---
      } else if (/^(today|what('?s| is) due)/i.test(lower)) {
        const today = new Date().toISOString().split("T")[0];
        const todayTasks = await storage.getTasksByDate(today);
        const pending = todayTasks.filter(t => !t.completed);
        const allPending = await storage.getPendingTasks();
        const highPriority = allPending.filter(t => t.priority === "high");

        if (pending.length === 0 && highPriority.length === 0) {
          reply = "Nothing specifically due today! Enjoy the breathing room.";
        } else {
          let parts: string[] = [];
          if (pending.length > 0) {
            parts.push("Due today:\n" + pending.map((t, i) => `${i + 1}. ${t.title}`).join("\n"));
          }
          if (highPriority.length > 0) {
            const notDueToday = highPriority.filter(t => t.dueDate !== today);
            if (notDueToday.length > 0) {
              parts.push("Also high priority:\n" + notDueToday.map(t => `- ${t.title}`).join("\n"));
            }
          }
          reply = parts.join("\n\n");
        }

      // --- "help" ---
      } else if (lower === "help" || lower === "commands") {
        reply = `Hey${userName ? ` ${userName}` : ""}! Here's how I work:\n\nJust text me anything and I'll add it to your list.\n\n"tasks" - see your to-do list\n"done [# or name]" - check something off\n"today" - what's due today\n\nYou can say "tomorrow" or "urgent" and I'll set the date/priority automatically.`;

      // --- anything else → add as task ---
      } else if (body.length > 0) {
        const parsed = parseTaskText(body);
        await storage.createTask({
          title: parsed.title,
          priority: parsed.priority,
          dueDate: parsed.dueDate,
          source: "sms",
        });
        let confirmation = `Got it - "${parsed.title}" added`;
        if (parsed.dueDate) {
          const today = new Date().toISOString().split("T")[0];
          const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
          if (parsed.dueDate === today) confirmation += " (due today)";
          else if (parsed.dueDate === tomorrow) confirmation += " (due tomorrow)";
          else confirmation += ` (due ${parsed.dueDate})`;
        }
        if (parsed.priority === "high") confirmation += " [high priority]";
        confirmation += ".";
        reply = confirmation;
      } else {
        reply = `Hey${userName ? ` ${userName}` : ""}! Text me a task to add it, or "tasks" to see your list.`;
      }

      // Respond with TwiML
      const escaped = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      res.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`
      );
    } catch (error) {
      console.error("SMS webhook error:", error);
      res.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Oops, something went wrong. Try again?</Message></Response>`
      );
    }
  });

  // Send SMS via Twilio (used for briefings and notifications)
  app.post("/api/sms/send", async (req, res) => {
    try {
      const { to, message } = req.body;
      const sid = (await storage.getSetting("twilioSid"))?.value;
      const token = (await storage.getSetting("twilioToken"))?.value;
      const twilioPhone = (await storage.getSetting("twilioPhone"))?.value;

      if (!sid || !token || !twilioPhone) {
        return res.status(400).json({ message: "Twilio not configured. Add credentials in Settings." });
      }

      const phone = to || (await storage.getSetting("phoneNumber"))?.value;
      if (!phone) {
        return res.status(400).json({ message: "No phone number configured" });
      }

      // Send via Twilio REST API
      const authHeader = Buffer.from(`${sid}:${token}`).toString("base64");
      // Use WhatsApp if enabled
      const useWhatsApp = (await storage.getSetting("useWhatsApp"))?.value === "true";
      const toNum = useWhatsApp ? `whatsapp:${phone}` : phone;
      const fromNum = useWhatsApp ? `whatsapp:${twilioPhone}` : twilioPhone;

      const params = new URLSearchParams({
        To: toNum,
        From: fromNum,
        Body: message,
      });

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );

      if (!twilioRes.ok) {
        const err = await twilioRes.text();
        console.error("Twilio error:", err);
        return res.status(500).json({ message: "Twilio send failed" });
      }

      const result = await twilioRes.json();
      res.json({ sid: result.sid, status: result.status });
    } catch (error) {
      console.error("SMS send error:", error);
      res.status(500).json({ message: "Failed to send SMS" });
    }
  });

  // =================== TASKS ===================

  // Get all tasks (with optional filter)
  app.get("/api/tasks", async (req, res) => {
    try {
      const { filter, source } = req.query;

      let taskList;
      if (filter === "today") {
        const today = new Date().toISOString().split("T")[0];
        taskList = await storage.getTasksByDate(today);
      } else if (filter === "pending") {
        taskList = await storage.getPendingTasks();
      } else if (filter === "completed") {
        taskList = await storage.getCompletedTasks();
      } else if (source && typeof source === "string") {
        taskList = await storage.getTasksBySource(source);
      } else {
        taskList = await storage.getTasks();
      }

      res.json(taskList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  // Get single task
  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Create task
  app.post("/api/tasks", async (req, res) => {
    try {
      const parsed = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(parsed);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid task data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  // Update task
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.updateTask(id, req.body);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Delete task
  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTask(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // =================== CALENDAR EVENTS ===================

  app.get("/api/events", async (req, res) => {
    try {
      const { date } = req.query;
      let events;
      if (date && typeof date === "string") {
        events = await storage.getCalendarEventsByDate(date);
      } else {
        events = await storage.getCalendarEvents();
      }
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const parsed = insertCalendarEventSchema.parse(req.body);
      const event = await storage.createCalendarEvent(parsed);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid event data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.updateCalendarEvent(id, req.body);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Sync endpoint - returns current events (manual sync triggers re-fetch from API)
  app.post("/api/events/sync", async (_req, res) => {
    try {
      const events = await storage.getCalendarEvents();
      res.json({ synced: events.length, events });
    } catch (error) {
      res.status(500).json({ message: "Failed to sync events" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCalendarEvent(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // =================== BRIEFINGS ===================

  app.get("/api/briefings", async (_req, res) => {
    try {
      const briefingList = await storage.getBriefings();
      res.json(briefingList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch briefings" });
    }
  });

  app.get("/api/briefings/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const briefing = await storage.getBriefing(id);
      if (!briefing) {
        return res.status(404).json({ message: "Briefing not found" });
      }
      res.json(briefing);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch briefing" });
    }
  });

  app.get("/api/briefings/latest", async (_req, res) => {
    try {
      const briefing = await storage.getLatestBriefing();
      if (!briefing) {
        return res.status(404).json({ message: "No briefings found" });
      }
      res.json(briefing);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch latest briefing" });
    }
  });

  // Generate a test briefing
  app.post("/api/briefings/generate", async (_req, res) => {
    try {
      const pendingTasks = await storage.getPendingTasks();
      const today = new Date();
      const dateStr = today.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const highPriority = pendingTasks.filter(t => t.priority === "high");
      const medPriority = pendingTasks.filter(t => t.priority === "medium");
      const lowPriority = pendingTasks.filter(t => t.priority === "low");

      let emailContent = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">`;
      emailContent += `<h1 style="font-size: 20px; font-weight: 600;">Good morning! Here's your day — ${dateStr}</h1>`;

      if (highPriority.length > 0) {
        emailContent += `<h2 style="font-size: 16px; margin-top: 24px; color: #dc2626;">Top Priorities</h2><ul>`;
        highPriority.forEach(t => {
          emailContent += `<li style="margin-bottom: 8px;"><strong>${t.title}</strong>${t.contextNote ? ` — ${t.contextNote}` : ""}${t.dueDate ? ` (Due: ${t.dueDate})` : ""}</li>`;
        });
        emailContent += `</ul>`;
      }

      if (medPriority.length > 0) {
        emailContent += `<h2 style="font-size: 16px; margin-top: 24px; color: #d97706;">Up Next</h2><ul>`;
        medPriority.forEach(t => {
          emailContent += `<li style="margin-bottom: 8px;"><strong>${t.title}</strong>${t.contextNote ? ` — ${t.contextNote}` : ""}${t.dueDate ? ` (Due: ${t.dueDate})` : ""}</li>`;
        });
        emailContent += `</ul>`;
      }

      if (lowPriority.length > 0) {
        emailContent += `<h2 style="font-size: 16px; margin-top: 24px; color: #16a34a;">When You Have Time</h2><ul>`;
        lowPriority.forEach(t => {
          emailContent += `<li style="margin-bottom: 8px;"><strong>${t.title}</strong>${t.contextNote ? ` — ${t.contextNote}` : ""}</li>`;
        });
        emailContent += `</ul>`;
      }

      if (pendingTasks.length === 0) {
        emailContent += `<p style="color: #6b7280;">You're all caught up. Enjoy your day.</p>`;
      }

      emailContent += `</div>`;

      // SMS version - warm and conversational
      const userName = (await storage.getSetting("userName"))?.value || "";
      const todayDate = today.toISOString().split("T")[0];
      const tomorrowDate = new Date(today.getTime() + 86400000).toISOString().split("T")[0];
      const overdue = pendingTasks.filter(t => t.dueDate && t.dueDate < todayDate);
      const dueToday = pendingTasks.filter(t => t.dueDate === todayDate);
      const dueTomorrow = pendingTasks.filter(t => t.dueDate === tomorrowDate);

      let smsContent = `Good morning${userName ? ` ${userName}` : ""}! Here's your day:\n\n`;

      if (pendingTasks.length === 0) {
        smsContent += "Nothing on the list - enjoy your free day!";
      } else {
        if (overdue.length > 0) {
          smsContent += `Carry over (${overdue.length}):\n`;
          overdue.slice(0, 3).forEach((t, i) => { smsContent += `  ${i + 1}. ${t.title}\n`; });
          if (overdue.length > 3) smsContent += `  + ${overdue.length - 3} more\n`;
          smsContent += "\n";
        }

        if (dueToday.length > 0) {
          smsContent += `Today:\n`;
          dueToday.forEach((t, i) => { smsContent += `  ${i + 1 + overdue.length}. ${t.title}${t.priority === "high" ? " *" : ""}\n`; });
          smsContent += "\n";
        }

        if (dueTomorrow.length > 0) {
          smsContent += `Tomorrow:\n`;
          dueTomorrow.slice(0, 3).forEach(t => { smsContent += `  - ${t.title}\n`; });
          smsContent += "\n";
        }

        // If no date-specific tasks shown yet, show top tasks
        if (overdue.length === 0 && dueToday.length === 0 && dueTomorrow.length === 0) {
          const top = pendingTasks.slice(0, 5);
          top.forEach((t, i) => {
            smsContent += `${i + 1}. ${t.title}${t.priority === "high" ? " *" : ""}\n`;
          });
          if (pendingTasks.length > 5) smsContent += `\n+ ${pendingTasks.length - 5} more on your list`;
        }

        smsContent += `\n${pendingTasks.length} total tasks. Reply "done #" to check one off!`;
      }

      let deliveredSms = 0;

      // Auto-send SMS if Twilio is configured and SMS delivery is enabled
      const briefingSmsEnabled = await storage.getSetting("briefingSms");
      const sid = (await storage.getSetting("twilioSid"))?.value;
      const twilioToken = (await storage.getSetting("twilioToken"))?.value;
      const twilioPhone = (await storage.getSetting("twilioPhone"))?.value;
      const userPhone = (await storage.getSetting("phoneNumber"))?.value;

      if (briefingSmsEnabled?.value === "true" && sid && twilioToken && twilioPhone && userPhone) {
        try {
          const useWhatsApp = (await storage.getSetting("useWhatsApp"))?.value === "true";
          const authHeader = Buffer.from(`${sid}:${twilioToken}`).toString("base64");
          const params = new URLSearchParams({
            To: useWhatsApp ? `whatsapp:${userPhone}` : userPhone,
            From: useWhatsApp ? `whatsapp:${twilioPhone}` : twilioPhone,
            Body: smsContent,
          });
          const twilioRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${authHeader}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: params.toString(),
            }
          );
          if (twilioRes.ok) deliveredSms = 1;
        } catch (smsErr) {
          console.error("Briefing SMS delivery failed:", smsErr);
        }
      }

      const briefing = await storage.createBriefing({
        date: today.toISOString().split("T")[0],
        contentEmail: emailContent,
        contentSms: smsContent,
        deliveredEmail: 0,
        deliveredSms: deliveredSms,
      });

      res.status(201).json(briefing);
    } catch (error) {
      console.error("Briefing generation error:", error);
      res.status(500).json({ message: "Failed to generate briefing" });
    }
  });

  // =================== SETTINGS ===================

  app.get("/api/settings", async (_req, res) => {
    try {
      const allSettings = await storage.getAllSettings();
      const settingsObj: Record<string, string> = {};
      allSettings.forEach(s => {
        if (s.value !== null) settingsObj[s.key] = s.value;
      });
      res.json(settingsObj);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const entries = Object.entries(req.body) as [string, string][];
      for (const [key, value] of entries) {
        await storage.setSetting(key, String(value));
      }
      const allSettings = await storage.getAllSettings();
      const settingsObj: Record<string, string> = {};
      allSettings.forEach(s => {
        if (s.value !== null) settingsObj[s.key] = s.value;
      });
      res.json(settingsObj);
    } catch (error) {
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // =================== CHAT ===================

  app.get("/api/chat", async (_req, res) => {
    try {
      const messages = await storage.getChatMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Message content required" });
      }

      // Save user message
      const userMessage = await storage.createChatMessage({
        role: "user",
        content,
      });

      // Generate AI response based on context
      const pendingTasks = await storage.getPendingTasks();
      const taskSummary = pendingTasks
        .slice(0, 10)
        .map(t => `- ${t.title} [${t.priority}]${t.dueDate ? ` due ${t.dueDate}` : ""}`)
        .join("\n");

      // Check for action commands
      let responseContent = "";
      const lowerContent = content.toLowerCase();

      if (lowerContent.includes("mark") && lowerContent.includes("done")) {
        // Try to find and complete a task
        const taskMatch = pendingTasks.find(t =>
          lowerContent.includes(t.title.toLowerCase().slice(0, 20))
        );
        if (taskMatch) {
          await storage.updateTask(taskMatch.id, { completed: 1 });
          responseContent = `Done — I've marked "${taskMatch.title}" as complete. ${pendingTasks.length - 1} tasks remaining.`;
        } else {
          responseContent = `I couldn't find a matching task. Your current tasks:\n${taskSummary}`;
        }
      } else if (lowerContent.includes("add") && (lowerContent.includes("task") || lowerContent.includes("remind"))) {
        responseContent = `To add a task, use the "+" button on the dashboard or tell me what to add. For example: "Add a task to call the dentist by tomorrow"`;
      } else if (lowerContent.includes("focus") || lowerContent.includes("priorit")) {
        const highTasks = pendingTasks.filter(t => t.priority === "high");
        if (highTasks.length > 0) {
          responseContent = `Here's what I'd focus on:\n\n${highTasks.map((t, i) => `${i + 1}. ${t.title}${t.contextNote ? ` — ${t.contextNote}` : ""}`).join("\n")}`;
        } else {
          responseContent = `No high-priority items right now. Your next tasks:\n${taskSummary || "No pending tasks. You're all caught up."}`;
        }
      } else if (lowerContent.includes("how many") || lowerContent.includes("status") || lowerContent.includes("summary")) {
        const completedToday = (await storage.getCompletedTasks()).filter(t => {
          const updated = new Date(t.updatedAt);
          const now = new Date();
          return updated.toDateString() === now.toDateString();
        });
        responseContent = `Here's your status:\n\n- ${pendingTasks.length} tasks pending\n- ${completedToday.length} completed today\n- ${pendingTasks.filter(t => t.priority === "high").length} high priority items`;
      } else {
        responseContent = `I can help you manage your tasks. Try asking:\n\n- "What should I focus on?"\n- "How many tasks do I have?"\n- "Mark [task name] as done"\n\nYou have ${pendingTasks.length} pending tasks right now.`;
      }

      const assistantMessage = await storage.createChatMessage({
        role: "assistant",
        content: responseContent,
      });

      res.json({ userMessage, assistantMessage });
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  app.delete("/api/chat", async (_req, res) => {
    try {
      await storage.clearChatMessages();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to clear chat" });
    }
  });

  // =================== STATS ===================

  app.get("/api/stats", async (_req, res) => {
    try {
      const allTasks = await storage.getTasks();
      const pending = allTasks.filter(t => !t.completed);
      const completed = allTasks.filter(t => t.completed);
      const today = new Date().toISOString().split("T")[0];
      const dueToday = pending.filter(t => t.dueDate && t.dueDate.startsWith(today));
      const overdue = pending.filter(t => t.dueDate && t.dueDate < today);
      const highPriority = pending.filter(t => t.priority === "high");

      res.json({
        total: allTasks.length,
        pending: pending.length,
        completed: completed.length,
        dueToday: dueToday.length,
        overdue: overdue.length,
        highPriority: highPriority.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  return httpServer;
}
