CREATE TABLE `workspace_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`enable_notifications` integer DEFAULT true,
	`global_cooldown_hours` integer DEFAULT 4,
	`alert_emails` text,
	`slack_webhook_url` text,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
