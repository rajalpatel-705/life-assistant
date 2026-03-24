import {
  type Task,
  type InsertTask,
  type Briefing,
  type InsertBriefing,
  type Setting,
  type InsertSetting,
  type CalendarEvent,
  type InsertCalendarEvent,
  type ChatMessage,
  type InsertChatMessage,
  tasks,
  briefings,
  settings,
  calendarEvents,
  chatMessages,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, asc, and, sql } from "drizzle-orm";

const dbPath = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    context_note TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    urgency_score REAL,
    due_date TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    content_email TEXT,
    content_sms TEXT,
    delivered_email INTEGER NOT NULL DEFAULT 0,
    delivered_sms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    location TEXT,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT,
    color TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite);

export interface IStorage {
  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;
  getTasksBySource(source: string): Promise<Task[]>;
  getTasksByDate(date: string): Promise<Task[]>;
  getPendingTasks(): Promise<Task[]>;
  getCompletedTasks(): Promise<Task[]>;

  // Briefings
  getBriefings(): Promise<Briefing[]>;
  getBriefing(id: number): Promise<Briefing | undefined>;
  createBriefing(briefing: InsertBriefing): Promise<Briefing>;
  getLatestBriefing(): Promise<Briefing | undefined>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;

  // Calendar Events
  getCalendarEvents(): Promise<CalendarEvent[]>;
  getCalendarEventsByDate(date: string): Promise<CalendarEvent[]>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: number): Promise<void>;

  // Chat
  getChatMessages(limit?: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  clearChatMessages(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Tasks
  async getTasks(): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .orderBy(asc(tasks.completed), desc(tasks.urgencyScore), asc(tasks.dueDate))
      .all();
  }

  async getTask(id: number): Promise<Task | undefined> {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  }

  async createTask(task: InsertTask): Promise<Task> {
    const now = new Date().toISOString();
    return db
      .insert(tasks)
      .values({ ...task, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }

  async updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined> {
    const now = new Date().toISOString();
    return db
      .update(tasks)
      .set({ ...task, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning()
      .get();
  }

  async deleteTask(id: number): Promise<void> {
    db.delete(tasks).where(eq(tasks.id, id)).run();
  }

  async getTasksBySource(source: string): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.source, source))
      .orderBy(asc(tasks.completed), desc(tasks.urgencyScore))
      .all();
  }

  async getTasksByDate(date: string): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(sql`date(${tasks.dueDate}) = date(${date})`)
      .orderBy(asc(tasks.completed), desc(tasks.urgencyScore))
      .all();
  }

  async getPendingTasks(): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.completed, 0))
      .orderBy(desc(tasks.urgencyScore), asc(tasks.dueDate))
      .all();
  }

  async getCompletedTasks(): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.completed, 1))
      .orderBy(desc(tasks.updatedAt))
      .all();
  }

  // Briefings
  async getBriefings(): Promise<Briefing[]> {
    return db.select().from(briefings).orderBy(desc(briefings.createdAt)).all();
  }

  async getBriefing(id: number): Promise<Briefing | undefined> {
    return db.select().from(briefings).where(eq(briefings.id, id)).get();
  }

  async createBriefing(briefing: InsertBriefing): Promise<Briefing> {
    const now = new Date().toISOString();
    return db
      .insert(briefings)
      .values({ ...briefing, createdAt: now })
      .returning()
      .get();
  }

  async getLatestBriefing(): Promise<Briefing | undefined> {
    return db.select().from(briefings).orderBy(desc(briefings.createdAt)).limit(1).get();
  }

  // Settings
  async getSetting(key: string): Promise<Setting | undefined> {
    return db.select().from(settings).where(eq(settings.key, key)).get();
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run();
      return { key, value };
    }
    return db.insert(settings).values({ key, value }).returning().get();
  }

  async getAllSettings(): Promise<Setting[]> {
    return db.select().from(settings).all();
  }

  // Calendar Events
  async getCalendarEvents(): Promise<CalendarEvent[]> {
    return db
      .select()
      .from(calendarEvents)
      .orderBy(asc(calendarEvents.startTime))
      .all();
  }

  async getCalendarEventsByDate(date: string): Promise<CalendarEvent[]> {
    return db
      .select()
      .from(calendarEvents)
      .where(sql`date(${calendarEvents.startTime}) = date(${date})`)
      .orderBy(asc(calendarEvents.startTime))
      .all();
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const now = new Date().toISOString();
    return db
      .insert(calendarEvents)
      .values({ ...event, createdAt: now })
      .returning()
      .get();
  }

  async updateCalendarEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    return db
      .update(calendarEvents)
      .set(event)
      .where(eq(calendarEvents.id, id))
      .returning()
      .get();
  }

  async deleteCalendarEvent(id: number): Promise<void> {
    db.delete(calendarEvents).where(eq(calendarEvents.id, id)).run();
  }

  // Chat
  async getChatMessages(limit = 50): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .orderBy(asc(chatMessages.createdAt))
      .limit(limit)
      .all();
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const now = new Date().toISOString();
    return db
      .insert(chatMessages)
      .values({ ...message, createdAt: now })
      .returning()
      .get();
  }

  async clearChatMessages(): Promise<void> {
    db.delete(chatMessages).run();
  }
}

export const storage = new DatabaseStorage();
