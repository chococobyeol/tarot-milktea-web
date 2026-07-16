import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tarotSessions = sqliteTable("tarot_sessions", {
  idHash: text("id_hash").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  aiCalls: integer("ai_calls").notNull().default(0),
  followupCount: integer("followup_count").notNull().default(0),
}, (table) => [
  index("tarot_sessions_expires_at_idx").on(table.expiresAt),
]);
