const assert = require('assert');
const stats = require('../tthingadmin/sales-stats.js');

const now = new Date('2026-06-11T12:00:00');
const products = [
  { code: 'A', name: '상품 A', supplyUnit: 6000 },
  { code: 'B', name: '상품 B', supplyPrice: '4,000원' }
];
const orders = [
  { date: '2026-06-11 10:00', status: 'done', productAmount: 20000, items: [{ code: 'A', name: '상품 A', qty: 2, unit: 10000 }] },
  { date: '2026-06-08 09:00', status: 'ready', amount: 15000, purchaseAmount: 7000, items: [{ code: 'B', qty: 1 }] },
  { date: '2026-06-05 11:00', status: 'cancel', productAmount: 90000, purchaseAmount: 10000 },
  { date: '2026-05-20 11:00', status: 'done', productAmount: 12000, items: [{ name: '상품 B', qty: 1, unit: 12000 }] },
  { date: '2026-03-20 11:00', status: 'done', productAmount: 30000, items: [{ name: '원가 미등록', qty: 1, unit: 30000 }] },
  { date: '2025-12-01 11:00', status: 'done', productAmount: 50000, purchaseAmount: 25000 }
];

const week = stats.aggregateSales(orders, products, { rangeKey: 'week', now });
assert.strictEqual(week.range.days, 7);
assert.strictEqual(week.summary.orderCount, 2);
assert.strictEqual(week.summary.sales, 35000);
assert.strictEqual(week.summary.purchase, 19000);
assert.strictEqual(week.summary.profit, 16000);
assert.strictEqual(week.summary.unknownCostOrders, 0);

const month = stats.aggregateSales(orders, products, { rangeKey: 'month', now });
assert.strictEqual(month.summary.orderCount, 3);
assert.strictEqual(month.summary.sales, 47000);
assert.strictEqual(month.summary.purchase, 23000);
assert.strictEqual(month.buckets.length, 30);

const quarter = stats.aggregateSales(orders, products, { rangeKey: 'quarter', now });
assert.strictEqual(quarter.summary.orderCount, 4);
assert.strictEqual(quarter.summary.unknownCostOrders, 1);
assert.strictEqual(quarter.summary.profit, 54000);
assert.strictEqual(quarter.buckets[0].end - quarter.buckets[0].start + 1, 7 * 24 * 60 * 60 * 1000);

const year = stats.aggregateSales(orders, products, { rangeKey: 'year', now });
assert.strictEqual(year.summary.orderCount, 5);
assert.strictEqual(year.summary.sales, 127000);
assert.strictEqual(year.summary.purchase, 48000);
assert.strictEqual(year.summary.profit, 79000);
assert.ok(year.buckets.length >= 12 && year.buckets.length <= 13);

console.log('sales-stats tests passed');
