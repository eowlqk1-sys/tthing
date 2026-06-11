(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TthingSalesStats = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const RANGE_DAYS = { day: 1, week: 7, month: 30, quarter: 90, half: 180, year: 365 };

  function toNumber(value) {
    return Number(String(value ?? 0).replace(/[^0-9.-]/g, "")) || 0;
  }

  function parseDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    const normalized = String(value || "").trim().replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfDay(value) {
    const date = parseDate(value) || new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function getRange(rangeKey, now) {
    const days = RANGE_DAYS[rangeKey] || RANGE_DAYS.week;
    const end = startOfDay(now);
    end.setHours(23, 59, 59, 999);
    const start = startOfDay(end);
    start.setDate(start.getDate() - days + 1);
    return { key: rangeKey, days, start, end };
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function buildProductCostLookup(products) {
    const byCode = new Map();
    const byName = new Map();
    (products || []).forEach((product) => {
      if (!product) return;
      const cost = toNumber(product.supplyUnit || product.supplyPrice);
      if (cost <= 0) return;
      if (product.code) byCode.set(String(product.code), cost);
      if (product.name) byName.set(normalizeName(product.name), cost);
    });
    return { byCode, byName };
  }

  function getItemCost(item, lookup) {
    const direct = toNumber(item?.supplyUnit || item?.purchaseUnit || item?.costUnit);
    if (direct > 0) return direct;
    if (item?.code && lookup.byCode.has(String(item.code))) return lookup.byCode.get(String(item.code));
    const name = normalizeName(item?.name);
    return name && lookup.byName.has(name) ? lookup.byName.get(name) : 0;
  }

  function getOrderCost(order, lookup) {
    const savedCost = toNumber(order?.purchaseAmount);
    if (savedCost > 0) return { amount: savedCost, complete: true };
    if (!Array.isArray(order?.items) || !order.items.length) return { amount: 0, complete: false };
    let complete = true;
    const amount = order.items.reduce((sum, item) => {
      const cost = getItemCost(item, lookup);
      if (cost <= 0) complete = false;
      return sum + cost * Math.max(1, toNumber(item?.qty));
    }, 0);
    return { amount, complete };
  }

  function aggregateSales(orders, products, options) {
    const now = options?.now || new Date();
    const range = getRange(options?.rangeKey || "week", now);
    const lookup = buildProductCostLookup(products);
    const included = (orders || []).filter((order) => {
      const date = parseDate(order?.date);
      return date && date >= range.start && date <= range.end && order.status !== "cancel";
    });

    const summary = included.reduce((result, order) => {
      const sales = toNumber(order.productAmount ?? order.amount);
      const cost = getOrderCost(order, lookup);
      result.sales += sales;
      result.purchase += cost.amount;
      result.orderCount += 1;
      if (!cost.complete) result.unknownCostOrders += 1;
      return result;
    }, { sales: 0, purchase: 0, profit: 0, orderCount: 0, unknownCostOrders: 0 });
    summary.profit = summary.sales - summary.purchase;

    const bucketDays = range.days <= 30 ? 1 : range.days <= 180 ? 7 : 30;
    const buckets = [];
    for (let cursor = new Date(range.start); cursor <= range.end; cursor.setDate(cursor.getDate() + bucketDays)) {
      const start = startOfDay(cursor);
      const end = new Date(Math.min(range.end.getTime(), start.getTime() + bucketDays * DAY_MS - 1));
      buckets.push({ start, end, sales: 0, purchase: 0, profit: 0, orderCount: 0, unknownCostOrders: 0 });
    }

    included.forEach((order) => {
      const date = parseDate(order.date);
      const bucket = buckets.find((item) => date >= item.start && date <= item.end);
      if (!bucket) return;
      const sales = toNumber(order.productAmount ?? order.amount);
      const cost = getOrderCost(order, lookup);
      bucket.sales += sales;
      bucket.purchase += cost.amount;
      bucket.profit = bucket.sales - bucket.purchase;
      bucket.orderCount += 1;
      if (!cost.complete) bucket.unknownCostOrders += 1;
    });

    return { range, summary, buckets };
  }

  return { RANGE_DAYS, aggregateSales, buildProductCostLookup, getOrderCost, getRange, parseDate, toNumber };
});
