/**
 * Order picking + bagging rules. Pure logic, no rendering.
 *
 * Flow: products picked from shelves land in the cart's top tray. From the
 * cart panel the player opens bags and moves tray items into them. When every
 * order line is bagged (and nothing else), the order can be closed.
 */
import type { OrderDef } from '../data/order';
import { getProduct, type ProductDef } from '../data/products';
import { productName, t } from '../i18n';
import type { BagRules } from '../data/order';

export const WRONG_ITEM_PENALTY = 5;

export interface Bag {
  open: boolean;
  closed: boolean;
  items: string[];
}

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; reason: string; penalty?: number };

export interface LineProgress {
  productId: string;
  qty: number;
  bagged: number;
  inTray: number;
}

/** Rule lines shown in the app for the enabled rules. */
export function ruleLines(rules: BagRules, capacity: number): string[] {
  const out: string[] = [];
  if (rules.chemical) out.push(t('rule.chem'));
  if (rules.fragile) out.push(t('rule.fragile'));
  out.push(t('rule.cap', { n: capacity }));
  out.push(t('rule.penalty'));
  return out;
}

/** Returns a reason string if `product` may not join a bag holding `existing`. */
export function bagConflict(product: ProductDef, existing: ProductDef[], rules: BagRules = { chemical: true, fragile: true }): string | null {
  for (const other of existing) {
    const chemFood =
      (product.tags.includes('chemical') && other.tags.includes('food')) || (product.tags.includes('food') && other.tags.includes('chemical'));
    if (rules.chemical && chemFood) return t('err.chem', { a: productName(product.id), b: productName(other.id) });
    const fragileHeavy =
      (product.tags.includes('fragile') && other.tags.includes('heavy')) || (product.tags.includes('heavy') && other.tags.includes('fragile'));
    if (rules.fragile && fragileHeavy) return t('err.fragile', { a: productName(product.id), b: productName(other.id) });
  }
  return null;
}

export class OrderSession {
  readonly order: OrderDef;
  tray: string[] = [];
  bags: Bag[];
  mistakes = 0;
  closed = false;

  constructor(order: OrderDef) {
    this.order = order;
    this.bags = Array.from({ length: order.bagCount }, () => ({ open: false, closed: false, items: [] }));
  }

  requiredQty(productId: string): number {
    return this.order.lines.find((l) => l.productId === productId)?.qty ?? 0;
  }

  baggedCount(productId: string): number {
    let n = 0;
    for (const b of this.bags) for (const i of b.items) if (i === productId) n++;
    return n;
  }

  trayCount(productId: string): number {
    return this.tray.filter((i) => i === productId).length;
  }

  progress(): LineProgress[] {
    return this.order.lines.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      bagged: this.baggedCount(l.productId),
      inTray: this.trayCount(l.productId),
    }));
  }

  totalRequired(): number {
    return this.order.lines.reduce((a, l) => a + l.qty, 0);
  }

  totalBagged(): number {
    return this.order.lines.reduce((a, l) => a + Math.min(l.qty, this.baggedCount(l.productId)), 0);
  }

  pick(productId: string): ActionResult {
    if (this.closed) return { ok: false, reason: t('err.closed') };
    if (this.tray.length >= this.order.trayCapacity) {
      return { ok: false, reason: t('err.handFull') };
    }
    getProduct(productId); // validates id
    this.tray.push(productId);
    return { ok: true };
  }

  /** Removes the held item (put back on the shelf). Free action. */
  discard(trayIndex: number): ActionResult {
    if (trayIndex < 0 || trayIndex >= this.tray.length) return { ok: false, reason: t('err.invalid') };
    this.tray.splice(trayIndex, 1);
    return { ok: true };
  }

  openBag(bagIndex: number): ActionResult {
    const bag = this.bags[bagIndex];
    if (!bag) return { ok: false, reason: t('err.invalid') };
    if (bag.open) return { ok: false, reason: t('err.bagOpen') };
    bag.open = true;
    return { ok: true };
  }

  /** Checks whether a tray item could go into a bag without changing state. */
  canPlace(trayIndex: number, bagIndex: number): ActionResult {
    if (this.closed) return { ok: false, reason: t('err.closed') };
    const pid = this.tray[trayIndex];
    const bag = this.bags[bagIndex];
    if (pid === undefined || !bag) return { ok: false, reason: t('err.invalid') };
    if (!bag.open) return { ok: false, reason: t('err.openFirst') };
    const product = getProduct(pid);
    const need = this.requiredQty(pid);
    if (need === 0) {
      return { ok: false, reason: t('err.notInOrder', { name: productName(pid) }), penalty: WRONG_ITEM_PENALTY };
    }
    if (this.baggedCount(pid) >= need) {
      return { ok: false, reason: t('err.enough', { name: productName(pid) }), penalty: WRONG_ITEM_PENALTY };
    }
    if (bag.items.length >= this.order.bagCapacity) return { ok: false, reason: t('err.bagFull') };
    const conflict = bagConflict(product, bag.items.map(getProduct), this.order.rules);
    if (conflict) return { ok: false, reason: conflict };
    return { ok: true };
  }

  place(trayIndex: number, bagIndex: number): ActionResult {
    const check = this.canPlace(trayIndex, bagIndex);
    if (!check.ok) {
      if (check.penalty) this.mistakes++;
      return check;
    }
    const [pid] = this.tray.splice(trayIndex, 1);
    this.bags[bagIndex].items.push(pid);
    return { ok: true };
  }

  /** Takes an item back out of a bag into the tray. */
  unbag(bagIndex: number, itemIndex: number): ActionResult {
    if (this.closed) return { ok: false, reason: t('err.closed') };
    const bag = this.bags[bagIndex];
    if (!bag || itemIndex < 0 || itemIndex >= bag.items.length) return { ok: false, reason: t('err.invalid') };
    if (this.tray.length >= this.order.trayCapacity) return { ok: false, reason: t('err.handFull') };
    const [pid] = bag.items.splice(itemIndex, 1);
    this.tray.push(pid);
    return { ok: true };
  }

  isComplete(): boolean {
    return this.order.lines.every((l) => this.baggedCount(l.productId) === l.qty);
  }

  /** The order can be closed when everything is bagged and the tray is empty. */
  canClose(): ActionResult {
    if (this.closed) return { ok: false, reason: t('err.closed') };
    const missing = this.order.lines.filter((l) => this.baggedCount(l.productId) < l.qty);
    if (missing.length) return { ok: false, reason: t('err.missing', { n: missing.reduce((a, l) => a + l.qty - this.baggedCount(l.productId), 0) }) };
    if (this.tray.length) return { ok: false, reason: t('err.holding') };
    return { ok: true };
  }

  close(): ActionResult {
    const check = this.canClose();
    if (!check.ok) return check;
    this.closed = true;
    for (const b of this.bags) {
      if (b.items.length) b.closed = true;
    }
    return { ok: true };
  }
}
