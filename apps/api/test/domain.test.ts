import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateSubtotal } from '../src/domain/money.ts';
import {
  canTransitionOrder,
  type OrderStatus,
} from '../src/domain/order-status.ts';
import {
  pagination,
  paginationMeta,
} from '../src/domain/pagination.ts';

describe('pagination', () => {
  it('normalizes unsafe page and limit values', () => {
    assert.deepEqual(pagination(0, 999), {
      page: 1,
      limit: 100,
      offset: 0,
    });
    assert.deepEqual(pagination(3, 20), {
      page: 3,
      limit: 20,
      offset: 40,
    });
    assert.deepEqual(paginationMeta(41, 3, 20), {
      page: 3,
      limit: 20,
      total: 41,
      totalPages: 3,
    });
  });
});

describe('order status transitions', () => {
  const allowed: Array<[OrderStatus, OrderStatus]> = [
    ['pending', 'confirmed'],
    ['pending', 'cancelled'],
    ['confirmed', 'processing'],
    ['processing', 'shipped'],
    ['shipped', 'delivered'],
  ];

  it('allows only forward transitions and cancellable pre-shipment states', () => {
    for (const [from, to] of allowed) {
      assert.equal(canTransitionOrder(from, to), true);
    }
    assert.equal(canTransitionOrder('delivered', 'cancelled'), false);
    assert.equal(canTransitionOrder('shipped', 'cancelled'), false);
    assert.equal(canTransitionOrder('confirmed', 'pending'), false);
    assert.equal(canTransitionOrder('pending', 'pending'), false);
  });
});

describe('money', () => {
  it('calculates totals using integer cents', () => {
    assert.equal(
      calculateSubtotal([
        { unitPriceCents: 12_500, quantity: 2 },
        { unitPriceCents: 9_990, quantity: 1 },
      ]),
      34_990,
    );
  });
});
