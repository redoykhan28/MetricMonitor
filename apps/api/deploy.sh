#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# MetricMonitor — Production Deployment Script
# Run this once to set up Cloudflare resources and deploy the API Worker.
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit immediately on any error

echo ""
echo "🚀 MetricMonitor Production Deployment"
echo "══════════════════════════════════════════"
echo ""

# ── Step 1: Create Cloudflare Queues ──────────────────────────────────────────
echo "📬 Step 1: Creating Cloudflare Queues..."
wrangler queues create ga4-monitor-queue || echo "  (Queue may already exist — continuing)"
wrangler queues create ga4-monitor-dlq   || echo "  (DLQ may already exist — continuing)"
echo "  ✓ Queues ready"
echo ""

# ── Step 2: Create Cloudflare KV Namespace ────────────────────────────────────
echo "🗄️  Step 2: Creating KV Namespace for GA4 cache..."
echo ""
echo "  ⚠️  Run this manually and paste the ID into wrangler.toml:"
echo ""
echo "  wrangler kv namespace create METRIC_CACHE"
echo ""
read -p "  Paste the KV namespace ID here: " KV_ID
read -p "  Paste the KV preview ID here: " KV_PREVIEW_ID

# Replace placeholders in wrangler.toml
sed -i '' "s/REPLACE_WITH_REAL_KV_ID/${KV_ID}/g" wrangler.toml
sed -i '' "s/REPLACE_WITH_PREVIEW_KV_ID/${KV_PREVIEW_ID}/g" wrangler.toml
echo "  ✓ KV namespace configured in wrangler.toml"
echo ""

# ── Step 3: Set Secrets via Wrangler ─────────────────────────────────────────
echo "🔐 Step 3: Setting production secrets..."
echo "  (You will be prompted to enter each secret)"
echo ""

wrangler secret put TURSO_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_PUBLISHABLE_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_EMAIL

echo ""
echo "  ✓ All secrets set"
echo ""

# ── Step 4: Deploy the Worker ──────────────────────────────────────────────────
echo "☁️  Step 4: Deploying API Worker to Cloudflare..."
wrangler deploy
echo ""
echo "  ✓ API Worker deployed!"
echo ""

# ── Done ───────────────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo ""
echo "Next steps:"
echo "  1. Copy the Worker URL from above and set it in your frontend .env"
echo "  2. Deploy frontend: cd ../web && npm run build"
echo "  3. Deploy frontend to Cloudflare Pages via the dashboard or wrangler pages deploy"
echo "  4. Update GOOGLE_CLIENT_ID OAuth redirect URI to include your production domain"
echo "  5. Update wrangler.toml DASHBOARD_URL to your real frontend domain"
echo ""
