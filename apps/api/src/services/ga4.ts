import { Env } from '../index';

/**
 * Service to interact with the Google Analytics Data API (GA4) using raw fetch.
 * Cloudflare Worker-compatible — no Node.js SDK, zero cold-start overhead.
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
   * Fetches a specific metric (no dimension filter) over a date range.
   * Includes Cloudflare KV caching to avoid hitting Google's rate limits.
   */
  async getMetric(
    propertyId: string,
    metricName: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
    const cacheKey = `ga4:${propertyId}:${metricName}:${startDate}:${endDate}`;
    const cachedData = await this.kvCache.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const data = await this._runReport(propertyId, {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: metricName }],
    });

    await this.kvCache.put(cacheKey, JSON.stringify(data), { expirationTtl: 900 });
    return data;
  }

  /**
   * Fetches a metric with an optional dimension filter.
   * Used by the compound rule engine to evaluate dimension-scoped conditions
   * (e.g. sessions where sessionSource = "paypal.com").
   *
   * Dimension filter is applied at the GA4 API level — not post-processed locally —
   * ensuring we stay well within Google's quota limits.
   */
  async getMetricWithDimensionFilter(
    propertyId: string,
    metricName: string,
    startDate: string,
    endDate: string,
    dimensionFilters: GA4DimensionFilter[]
  ): Promise<any> {
    // Build a stable cache key from filter params
    const filterKey = dimensionFilters
      .map(f => `${f.fieldName}:${f.operator}:${f.value}`)
      .join('|');
    const cacheKey = `ga4:${propertyId}:${metricName}:${startDate}:${endDate}:${filterKey}`;

    const cachedData = await this.kvCache.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Build GA4 dimensionFilter expression
    const dimensionFilter = buildGA4DimensionFilter(dimensionFilters);

    const requestBody: any = {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: metricName }],
      dimensionFilter,
    };

    // We must include the dimension in the report when filtering by it,
    // so GA4 can resolve the filter correctly
    if (dimensionFilters.length > 0) {
      const uniqueDims = [...new Set(dimensionFilters.map(f => f.fieldName))];
      requestBody.dimensions = uniqueDims.map(name => ({ name }));
    }

    const data = await this._runReport(propertyId, requestBody);
    await this.kvCache.put(cacheKey, JSON.stringify(data), { expirationTtl: 900 });
    return data;
  }

  /**
   * Fetches a dimension value directly (no aggregation) for dimension-equality conditions.
   * Used when we need to check "does this dimension value appear in the data at all".
   */
  async getDimensionValues(
    propertyId: string,
    dimensionName: string,
    startDate: string,
    endDate: string
  ): Promise<string[]> {
    const cacheKey = `ga4:dim:${propertyId}:${dimensionName}:${startDate}:${endDate}`;
    const cached = await this.kvCache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await this._runReport(propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimensionName }],
      metrics: [{ name: 'sessions' }], // GA4 requires at least one metric
    });

    const values: string[] = (data.rows || []).map(
      (row: any) => row.dimensionValues?.[0]?.value || ''
    );

    await this.kvCache.put(cacheKey, JSON.stringify(values), { expirationTtl: 900 });
    return values;
  }

  // ─── Internal: Raw GA4 runReport ───────────────────────────────────────────
  private async _runReport(propertyId: string, body: object): Promise<any> {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GA4 API Error (${response.status}): ${errText}`);
    }

    return response.json();
  }
}

// ─── GA4 Dimension Filter Builder ────────────────────────────────────────────

export interface GA4DimensionFilter {
  fieldName: string;
  operator: 'EXACT' | 'BEGINS_WITH' | 'ENDS_WITH' | 'CONTAINS' | 'IN_LIST' | 'REGEXP';
  value: string;
  caseSensitive?: boolean;
  /** If true, wraps filter in a NOT expression */
  negate?: boolean;
}

/**
 * Converts our internal dimension filter format into the GA4 Data API
 * dimensionFilter expression structure (supports AND of multiple filters and IN_LIST).
 */
function buildGA4DimensionFilter(filters: GA4DimensionFilter[]): object {
  if (filters.length === 0) return {};

  const filterExpressions = filters.map(f => {
    let filterBody: any;

    if (f.operator === 'IN_LIST') {
      const listValues = f.value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);

      filterBody = {
        fieldName: f.fieldName,
        inListFilter: {
          values: listValues,
          caseSensitive: f.caseSensitive ?? false,
        },
      };
    } else {
      filterBody = {
        fieldName: f.fieldName,
        stringFilter: {
          matchType: f.operator,
          value: f.value,
          caseSensitive: f.caseSensitive ?? false,
        },
      };
    }

    const expr: any = { filter: filterBody };

    if (f.negate) {
      return { notExpression: expr };
    }
    return expr;
  });

  if (filterExpressions.length === 1) {
    return filterExpressions[0];
  }

  return {
    andGroup: {
      expressions: filterExpressions,
    },
  };
}
