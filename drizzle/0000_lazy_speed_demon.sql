CREATE TABLE `tarot_sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ai_calls` integer DEFAULT 0 NOT NULL,
	`followup_count` integer DEFAULT 0 NOT NULL
);
