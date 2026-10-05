# MetricMonitor 📈

**MetricMonitor** is a real-time, zero-configuration alerting engine for Google Analytics 4. It acts as an automated watchdog for your web properties, allowing you to build Tag Manager-style rules to monitor critical traffic and revenue drops on autopilot. 

When your traffic tanks or revenue drops unexpectedly, MetricMonitor pings your Email, Discord, or Slack before your clients even notice.

---

## ✨ Features

- **Automated Watchdog:** Define conditional triggers (e.g., "Traffic drops by 30% compared to the 7-day average").
- **Multi-Property Support:** Connect your Google Analytics account via OAuth and monitor unlimited GA4 properties from a single dashboard.
- **Unified Dispatcher:** Get alerted instantly via **Email (Resend)**, **Discord Webhooks**, and a real-time **In-App Notification Center**.
- **Visual Analytics:** View real-time metric charts with adjustable date ranges right in the dashboard without having to open the bloated GA4 interface.
- **Smart Cooldowns:** Built-in alert cooldowns (e.g., 4 hours) to prevent notification spam during prolonged incidents.
- **Mobile-First Design:** Fully responsive, premium glassmorphism UI built with Tailwind CSS, React, and Lucide icons.

## 🛠️ Tech Stack

Built for maximum edge performance and zero cold starts.

- **Frontend:** React + Vite, Tailwind CSS, Recharts (for data visualization)
- **Backend:** Hono API running on Cloudflare Workers
- **Database:** Turso (libSQL/SQLite) with Drizzle ORM
- **Authentication:** Clerk (with Google OAuth integration)
- **External APIs:** Google Analytics Data API, Google Analytics Admin API, Resend (for emails)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A Cloudflare account (for deploying Workers)
- A Clerk account (for auth)
- A Turso account (for the database)
- Google Cloud Console project (with Analytics APIs enabled)

### Local Development

1. **Clone the repo**
   ```bash
   git clone https://github.com/redoykhan28/MetricMonitor.git
   cd MetricMonitor
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the `apps/web` directory for Clerk keys, and a `.dev.vars` file in the `apps/api` directory for backend secrets (Turso, Google OAuth, Resend).

4. **Database Setup**
   Run the Drizzle migrations to initialize the Turso database:
   ```bash
   npm run db:push --workspace=@metric-monitor/api
   ```

5. **Start the Development Servers**
   In two separate terminals, run the API and the Web frontend:
   ```bash
   npm run dev:api
   npm run dev:web
   ```

## 🔒 Security & Privacy
MetricMonitor uses `analytics.readonly` scopes. It never asks for write permissions to your Google Analytics accounts, and OAuth credentials are encrypted securely.

---
*Built for digital agencies and pro marketing teams.*
