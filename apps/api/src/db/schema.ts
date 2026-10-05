import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table (Synced from Clerk Webhooks)
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // Clerk User ID
  email: text('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// Workspaces (Multi-tenant)
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(), // e.g. UUID
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// Workspace Settings
export const workspaceSettings = sqliteTable('workspace_settings', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id),
  enableNotifications: integer('enable_notifications', { mode: 'boolean' }).default(true),
  globalCooldownHours: integer('global_cooldown_hours').default(4),
  alertEmails: text('alert_emails'), // comma separated
  emailOnWelcome: integer('email_on_welcome', { mode: 'boolean' }).default(true),
  emailOnGa4Added: integer('email_on_ga4_added', { mode: 'boolean' }).default(false),
  emailOnTrackerAdded: integer('email_on_tracker_added', { mode: 'boolean' }).default(false),
  discordWebhookUrl: text('discord_webhook_url'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// In-App Notifications
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(), // 'welcome', 'ga4_added', 'tracker_added', 'alert'
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// Google OAuth Credentials
export const googleCredentials = sqliteTable('google_credentials', {
  id: text('id').primaryKey(), // UUID
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id).unique(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  email: text('email').notNull(), // The Google account email
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// GA4 Properties
export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(), // UUID
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(), // e.g. "My Online Store"
  ga4PropertyId: text('ga4_property_id').notNull(), // e.g. "123456789"
  domain: text('domain'),
  timezone: text('timezone').default('UTC'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// Trackers (The Alerting Rules)
export const trackers = sqliteTable('trackers', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  name: text('name').notNull(), // e.g. "Sudden Traffic Drop"
  
  // The rule condition
  metric: text('metric').notNull(), // e.g. "activeUsers", "purchaseRevenue"
  condition: text('condition').notNull(), // "drops_by", "greater_than"
  thresholdValue: integer('threshold_value').notNull(), // e.g. 40 (for 40%)
  compareWindow: text('compare_window').notNull(), // e.g. "previous_day", "avg_7_days"
  
  // State and cooldowns
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  cooldownHours: integer('cooldown_hours').default(4), // Prevent spam
  lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// Alert History / Incident Logs
export const trackerEvents = sqliteTable('tracker_events', {
  id: text('id').primaryKey(),
  trackerId: text('tracker_id').notNull().references(() => trackers.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  
  // Data at time of incident
  expectedValue: text('expected_value').notNull(), 
  actualValue: text('actual_value').notNull(),
  
  status: text('status').default('triggered'), // 'triggered', 'resolved', 'ignored'
  notifiedVia: text('notified_via'), // 'email', 'slack'
  
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});
