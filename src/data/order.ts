/** Order types. Orders themselves are generated per day by logic/career.ts. */

export interface OrderLine {
  productId: string;
  qty: number;
}

export interface BagRules {
  /** Cleaning products may not share a bag with food. */
  chemical: boolean;
  /** Eggs may not share a bag with heavy items. */
  fragile: boolean;
}

export interface OrderDef {
  id: string;
  customer: string;
  address: string;
  /** i18n-free customer note (shown as written by the customer). */
  note: string;
  distanceKm: number;
  courier: string;
  /** Total time limit in seconds (picking + bagging + handover). */
  timeLimit: number;
  bagCount: number;
  bagCapacity: number;
  /** How many products the player can hold at once. */
  trayCapacity: number;
  rules: BagRules;
  lines: OrderLine[];
}

/** One order of a work day, with the context it is played in. */
export interface LevelDef {
  day: number;
  /** 0-based position in the day. */
  index: number;
  tutorial: boolean;
  /** Express: less time, bigger pay and tip. */
  express: boolean;
  order: OrderDef;
}
