/**
 * Phase 4.2 — Branded HTML Email Templates
 * All templates use inline CSS for maximum email client compatibility.
 */

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  margin: 0; padding: 0; background-color: #09090b;
`;

const CONTAINER = `
  max-width: 560px; margin: 0 auto; padding: 24px 16px;
`;

const CARD = `
  background: #18181b; border-radius: 16px; border: 1px solid #27272a;
  padding: 32px; margin-bottom: 16px;
`;

const FOOTER = `
  text-align: center; color: #52525b; font-size: 12px;
  padding: 16px 0; border-top: 1px solid #27272a; margin-top: 8px;
`;

function logo() {
  return `
    <div style="margin-bottom: 28px;">
      <span style="font-size: 20px; font-weight: 700; color: #a78bfa; letter-spacing: -0.5px;">
        ⬡ MetricMonitor
      </span>
    </div>
  `;
}

function metricRow(label: string, value: string, color = '#e4e4e7') {
  return `
    <tr>
      <td style="padding: 10px 0; color: #71717a; font-size: 13px; border-bottom: 1px solid #27272a;">${label}</td>
      <td style="padding: 10px 0; text-align: right; font-weight: 600; color: ${color}; font-size: 13px; border-bottom: 1px solid #27272a;">${value}</td>
    </tr>
  `;
}

function ctaButton(text: string, href: string) {
  return `
    <a href="${href}" style="
      display: inline-block; margin-top: 24px;
      background: #7c3aed; color: #ffffff;
      font-size: 14px; font-weight: 600;
      padding: 12px 28px; border-radius: 8px;
      text-decoration: none; text-align: center;
    ">${text}</a>
  `;
}

// ─── Alert Email ────────────────────────────────────────────────────────────
export function alertEmailHtml(opts: {
  trackerName: string;
  metric: string;
  current: number;
  baseline: number;
  propertyName?: string;
  dashboardUrl?: string;
}): string {
  const { trackerName, metric, current, baseline, propertyName, dashboardUrl = 'https://app.metricmonitor.io' } = opts;
  const dropPct = baseline > 0 ? Math.round(((baseline - current) / baseline) * 100) : 0;
  const formattedMetric = metric.replace(/([A-Z])/g, ' $1').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}

      <div style="background: #450a0a; border: 1px solid #7f1d1d; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;">
        <span style="color: #ef4444; font-size: 22px; font-weight: 700;">🚨 Alert Triggered</span>
        <p style="margin: 6px 0 0; color: #fca5a5; font-size: 14px;">
          Your tracker <strong>"${trackerName}"</strong> has detected an anomaly.
          ${propertyName ? `Property: <strong>${propertyName}</strong>` : ''}
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        ${metricRow('Metric', formattedMetric)}
        ${metricRow('Baseline (Expected)', baseline.toLocaleString())}
        ${metricRow('Current (Actual)', current.toLocaleString(), '#ef4444')}
        ${metricRow('Drop', `${dropPct}%`, '#ef4444')}
        ${metricRow('Detected At', new Date().toUTCString())}
      </table>

      <div style="text-align: center;">
        ${ctaButton('View Dashboard →', dashboardUrl)}
      </div>
    </div>

    <p style="${FOOTER}">
      You are receiving this because you have alert notifications enabled.<br>
      Manage your preferences in your <a href="${dashboardUrl}/settings" style="color: #a78bfa;">MetricMonitor Settings</a>.
      <br><br>© ${new Date().getFullYear()} MetricMonitor. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}

// ─── Test Alert Email (Simulation / Health Check) ───────────────────────────
export function testAlertEmailHtml(opts: {
  recipients?: string[];
  dashboardUrl?: string;
}): string {
  const { recipients = [], dashboardUrl = 'https://app.metricmonitor.io' } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetricMonitor Test Notification</title>
</head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}

      <!-- Test Banner Badge -->
      <div style="background: rgba(79, 248, 210, 0.08); border: 1px solid rgba(79, 248, 210, 0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="margin-bottom: 10px;">
          <span style="background: #4FF8D2; color: #0D1318; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 8px; border-radius: 6px; display: inline-block;">
            TEST NOTIFICATION
          </span>
          <span style="color: #4FF8D2; font-size: 13px; font-weight: 600; margin-left: 8px;">
            Simulation Only — No Action Needed
          </span>
        </div>
        <h2 style="margin: 6px 0 8px; color: #ffffff; font-size: 18px; font-weight: 700; line-height: 1.3;">
          ✅ Your Alert Channel is Configured & Working!
        </h2>
        <p style="margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">
          This email was triggered by clicking <strong>"Send Test Alert Email"</strong> in your MetricMonitor dashboard. 
          <span style="color: #cbd5e1; font-weight: 500;">No traffic drop or anomaly has occurred on your live Google Analytics properties.</span>
        </p>
      </div>

      <!-- Preview of what a real alert looks like -->
      <div style="margin-bottom: 22px;">
        <p style="margin: 0 0 10px; color: #71717a; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          Preview (How Real Alerts Look):
        </p>
        <div style="background: #201314; border: 1px solid #4a151b; border-radius: 10px; padding: 14px 16px;">
          <div style="color: #f87171; font-size: 14px; font-weight: 600; margin-bottom: 4px;">
            🚨 [Sample] E-commerce Checkout Drop Detected
          </div>
          <p style="margin: 0; color: #fca5a5; font-size: 12px; line-height: 1.4;">
            When a real tracker triggers, you will receive real-time baseline metrics, percentage drops, and direct incident links.
          </p>
        </div>
      </div>

      <!-- Test Details Table -->
      <table style="width: 100%; border-collapse: collapse;">
        ${metricRow('Channel Status', 'Verified & Active', '#4FF8D2')}
        ${metricRow('Delivery Provider', 'Brevo SMTP REST API')}
        ${recipients.length > 0 ? metricRow('Recipients', recipients.join(', ')) : ''}
        ${metricRow('Sent At', new Date().toUTCString())}
      </table>

      <div style="text-align: center; margin-top: 24px;">
        ${ctaButton('Go to Dashboard →', dashboardUrl)}
      </div>
    </div>

    <p style="${FOOTER}">
      This was an automated test initiated from your MetricMonitor Alert Settings.<br>
      © ${new Date().getFullYear()} MetricMonitor. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}

// ─── Recovery Email ──────────────────────────────────────────────────────────
export function recoveryEmailHtml(opts: {
  trackerName: string;
  metric: string;
  current: number;
  baseline: number;
  propertyName?: string;
  dashboardUrl?: string;
}): string {
  const { trackerName, metric, current, baseline, propertyName, dashboardUrl = 'https://app.metricmonitor.io' } = opts;
  const formattedMetric = metric.replace(/([A-Z])/g, ' $1').trim();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}

      <div style="background: #052e16; border: 1px solid #14532d; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;">
        <span style="color: #22c55e; font-size: 22px; font-weight: 700;">✅ All Clear — Recovered</span>
        <p style="margin: 6px 0 0; color: #86efac; font-size: 14px;">
          <strong>"${trackerName}"</strong> has returned to normal levels.
          ${propertyName ? `Property: <strong>${propertyName}</strong>` : ''}
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        ${metricRow('Metric', formattedMetric)}
        ${metricRow('Baseline', baseline.toLocaleString())}
        ${metricRow('Current (Recovered)', current.toLocaleString(), '#22c55e')}
        ${metricRow('Resolved At', new Date().toUTCString())}
      </table>

      <div style="text-align: center;">
        ${ctaButton('View Dashboard →', dashboardUrl)}
      </div>
    </div>

    <p style="${FOOTER}">
      © ${new Date().getFullYear()} MetricMonitor. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}

// ─── Welcome Email ───────────────────────────────────────────────────────────
export function welcomeEmailHtml(opts: {
  userFirstName?: string;
  dashboardUrl?: string;
}): string {
  const { userFirstName = 'there', dashboardUrl = 'https://app.metricmonitor.io' } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}
      <h1 style="color: #e4e4e7; font-size: 24px; font-weight: 700; margin: 0 0 12px;">
        Welcome, ${userFirstName}! 👋
      </h1>
      <p style="color: #a1a1aa; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">
        Your MetricMonitor account is set up and ready. You now have a real-time GA4 alerting engine monitoring your properties on autopilot.
      </p>

      <div style="background: #1c1c2e; border: 1px solid #3b3b5c; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #a78bfa; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 12px;">🚀 Next Steps</p>
        <p style="color: #c4b5fd; font-size: 14px; margin: 6px 0;">1. Connect your Google Analytics account</p>
        <p style="color: #c4b5fd; font-size: 14px; margin: 6px 0;">2. Select the GA4 Properties you want to monitor</p>
        <p style="color: #c4b5fd; font-size: 14px; margin: 6px 0;">3. Create your first Tracker (or use a Quick Preset)</p>
        <p style="color: #c4b5fd; font-size: 14px; margin: 6px 0;">4. Sit back — we will alert you if anything goes wrong</p>
      </div>

      <div style="text-align: center;">
        ${ctaButton('Go to Dashboard →', dashboardUrl)}
      </div>
    </div>

    <p style="${FOOTER}">
      © ${new Date().getFullYear()} MetricMonitor. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}

// ─── GA4 Property Added Email ────────────────────────────────────────────────
export function ga4AddedEmailHtml(opts: {
  propertyName: string;
  ga4PropertyId: string;
  dashboardUrl?: string;
}): string {
  const { propertyName, ga4PropertyId, dashboardUrl = 'https://app.metricmonitor.io' } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}
      <h2 style="color: #e4e4e7; font-size: 20px; font-weight: 700; margin: 0 0 8px;">
        ✅ New GA4 Property Connected
      </h2>
      <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 24px;">
        A new Google Analytics 4 property has been added to your workspace and is now being monitored.
      </p>

      <table style="width: 100%; border-collapse: collapse;">
        ${metricRow('Property Name', propertyName, '#a78bfa')}
        ${metricRow('GA4 Property ID', ga4PropertyId)}
        ${metricRow('Connected At', new Date().toUTCString())}
      </table>

      <div style="text-align: center;">
        ${ctaButton('Create a Tracker →', dashboardUrl)}
      </div>
    </div>
    <p style="${FOOTER}">© ${new Date().getFullYear()} MetricMonitor. All rights reserved.</p>
  </div>
</body>
</html>`;
}

// ─── Revoked Token Alert Email ───────────────────────────────────────────────
export function revokedTokenEmailHtml(opts: {
  workspaceName?: string;
  dashboardUrl?: string;
}): string {
  const { workspaceName = 'your workspace', dashboardUrl = 'https://app.metricmonitor.io' } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}
      <div style="background: #451a03; border: 1px solid #78350f; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;">
        <span style="color: #f97316; font-size: 20px; font-weight: 700;">⚠️ Action Required</span>
        <p style="margin: 6px 0 0; color: #fed7aa; font-size: 14px;">
          Your Google Analytics connection for <strong>${workspaceName}</strong> has expired or been revoked.
          Monitoring has been paused for your properties.
        </p>
      </div>

      <p style="color: #a1a1aa; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">
        This happens when you revoke access from Google or the authorization token expires. To resume monitoring, please reconnect your Google account.
      </p>

      <div style="text-align: center;">
        ${ctaButton('Reconnect Google Analytics →', `${dashboardUrl}?reconnect=1`)}
      </div>
    </div>
    <p style="${FOOTER}">© ${new Date().getFullYear()} MetricMonitor. All rights reserved.</p>
  </div>
</body>
</html>`;
}

// ─── Compound Alert Email ─────────────────────────────────────────────────────
export function compoundAlertEmailHtml(opts: {
  trackerName: string;
  propertyName?: string;
  conditionRows: Array<{
    label: string;
    actual: string;
    expected?: string;
  }>;
  dashboardUrl?: string;
}): string {
  const { trackerName, propertyName, conditionRows, dashboardUrl = 'https://app.metricmonitor.io' } = opts;

  const conditionTableRows = conditionRows.map(row => `
    <tr>
      <td style="padding: 10px 0; color: #71717a; font-size: 13px; border-bottom: 1px solid #27272a;">
        🔴 ${row.label}
      </td>
      <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #ef4444; font-size: 13px; border-bottom: 1px solid #27272a;">
        ${row.actual}
      </td>
      <td style="padding: 10px 0; text-align: right; color: #52525b; font-size: 12px; border-bottom: 1px solid #27272a; padding-left: 12px;">
        ${row.expected ? `baseline: ${row.expected}` : ''}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER}">
    <div style="${CARD}">
      ${logo()}

      <div style="background: #450a0a; border: 1px solid #7f1d1d; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px;">
        <span style="color: #ef4444; font-size: 22px; font-weight: 700;">🚨 Anomaly Detected</span>
        <p style="margin: 6px 0 0; color: #fca5a5; font-size: 14px;">
          Your compound rule <strong>"${trackerName}"</strong> has triggered.
          ${propertyName ? `Property: <strong>${propertyName}</strong>` : ''}
        </p>
      </div>

      <p style="color: #a1a1aa; font-size: 13px; margin: 0 0 16px; line-height: 1.6;">
        The following condition group matched — all conditions within the group were true simultaneously:
      </p>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; color: #52525b; font-size: 11px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid #3f3f46;">Condition</th>
            <th style="text-align: right; color: #52525b; font-size: 11px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid #3f3f46;">Actual Value</th>
            <th style="text-align: right; color: #52525b; font-size: 11px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid #3f3f46; padding-left: 12px;">Reference</th>
          </tr>
        </thead>
        <tbody>
          ${conditionTableRows}
        </tbody>
      </table>

      <div style="background: #1c1c1c; border-radius: 8px; padding: 14px 16px; margin-top: 20px;">
        <p style="color: #52525b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px;">What to investigate</p>
        <p style="color: #a1a1aa; font-size: 13px; margin: 0; line-height: 1.6;">
          Check your GA4 setup for cross-domain tracking issues, payment gateway referral attribution,
          consent banner failures, broken UTM parameters, or double-tracking tags.
        </p>
      </div>

      <div style="text-align: center;">
        ${ctaButton('Investigate in Dashboard →', dashboardUrl)}
      </div>
    </div>

    <p style="${FOOTER}">
      You are receiving this because you have alert notifications enabled.<br>
      Manage your preferences in your <a href="${dashboardUrl}/settings" style="color: #a78bfa;">MetricMonitor Settings</a>.
      <br><br>© ${new Date().getFullYear()} MetricMonitor. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}

