/* Per-tenant usage accounting. In production you'd persist this for billing;
   in-memory is enough to demonstrate metering and to power /admin/usage. */
export function createUsage() {
  const byTenant = new Map();
  const bump = (tenant, field) => {
    if (!byTenant.has(tenant)) byTenant.set(tenant, { requests: 0, cacheHits: 0, upstreamFetches: 0, errors: 0 });
    byTenant.get(tenant)[field]++;
  };
  return {
    record({ tenant, cached, error }) {
      bump(tenant, 'requests');
      if (error) bump(tenant, 'errors');
      else if (cached) bump(tenant, 'cacheHits');
      else bump(tenant, 'upstreamFetches');
    },
    snapshot() {
      const out = {};
      for (const [tenant, v] of byTenant) out[tenant] = { ...v };
      return out;
    }
  };
}
