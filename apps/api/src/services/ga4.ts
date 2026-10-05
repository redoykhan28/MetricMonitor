import { Env } from '../index';

/**
 * Service to interact with the Google Analytics Data API (GA4) using raw fetch.
 * This is used instead of the official Google Node.js SDK to ensure compatibility 
 * and ultra-fast cold starts on Cloudflare Workers.
 */
export class GA4Service {
  private accessToken: string;
  private kvCache: KVNamespace;

  constructor(accessToken: string, kvCache: KVNamespace) {
    this.accessToken = accessToken;
    this.kvCache = kvCache;
  }

  /**
   * Fetches the list of GA4 properties the user has access to.
   * Useful for the dashboard dropdown when connecting a new property.
   */
  async listProperties() {
    const url = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch properties: ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Fetches a specific metric for a given property over a date range.
   * Includes Cloudflare KV caching to prevent hitting Google's rate limits.
   */
  async getMetric(propertyId: string, metricName: string, startDate: string, endDate: string) {
    // 1. Check Cloudflare KV Cache first (Cache key combines property, metric, and dates)
    const cacheKey = `ga4:${propertyId}:${metricName}:${startDate}:${endDate}`;
    const cachedData = await this.kvCache.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // 2. If not in cache, fetch from Google Analytics Data API
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    
    const requestBody = {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: metricName }],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`GA4 API Error: ${await response.text()}`);
    }

    const data = await response.json();

    // 3. Save to Cloudflare KV Cache (expire in 15 minutes)
    await this.kvCache.put(cacheKey, JSON.stringify(data), { expirationTtl: 900 });

    return data;
  }
}
