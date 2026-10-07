/** Orders and the shift (level) campaign. */
import type { MoodId } from '../render/moodIds';

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

export interface LevelDef {
  num: number;
  mood: MoodId;
  shoppers: number;
  tutorial: boolean;
  order: OrderDef;
}

const base = { trayCapacity: 1, distanceKm: 1.8 };

export const LEVELS: LevelDef[] = [
  {
    num: 1,
    mood: 'day',
    shoppers: 4,
    tutorial: true,
    order: {
      ...base,
      id: '#1001',
      customer: 'Maya R.',
      address: '12 Maple Street',
      note: 'Just the basics please 🙂',
      courier: 'Leo',
      timeLimit: 180,
      bagCount: 1,
      bagCapacity: 5,
      rules: { chemical: false, fragile: false },
      lines: [
        { productId: 'milk_full', qty: 1 },
        { productId: 'bread_white', qty: 1 },
        { productId: 'banana', qty: 1 },
      ],
    },
  },
  {
    num: 2,
    mood: 'day',
    shoppers: 6,
    tutorial: false,
    order: {
      ...base,
      id: '#1017',
      customer: 'Tom & Ava',
      address: '4 Harbor Lane',
      note: 'Breakfast in bed surprise! 🥐',
      courier: 'Nina',
      timeLimit: 210,
      bagCount: 2,
      bagCapacity: 4,
      rules: { chemical: false, fragile: false },
      lines: [
        { productId: 'eggs_10', qty: 1 },
        { productId: 'cheese_white', qty: 1 },
        { productId: 'tomato', qty: 1 },
        { productId: 'simit', qty: 2 },
        { productId: 'juice', qty: 1 },
      ],
    },
  },
  {
    num: 3,
    mood: 'day',
    shoppers: 8,
    tutorial: false,
    order: {
      ...base,
      id: '#1029',
      customer: 'Mr. Kowalski',
      address: '88 Elm Court, Apt 3',
      note: 'Please keep the soap away from my food!',
      courier: 'Sam',
      timeLimit: 240,
      bagCount: 2,
      bagCapacity: 4,
      rules: { chemical: true, fragile: false },
      lines: [
        { productId: 'dish_soap', qty: 1 },
        { productId: 'sponge', qty: 1 },
        { productId: 'pasta', qty: 1 },
        { productId: 'chips_potato', qty: 1 },
        { productId: 'cola', qty: 1 },
        { productId: 'honey', qty: 1 },
      ],
    },
  },
  {
    num: 4,
    mood: 'sunset',
    shoppers: 8,
    tutorial: false,
    order: {
      ...base,
      id: '#1033',
      customer: 'Lina P.',
      address: 'Riverside Park, gate B',
      note: 'Picnic! Don’t crack the eggs 🥚',
      courier: 'Leo',
      timeLimit: 240,
      bagCount: 2,
      bagCapacity: 5,
      rules: { chemical: true, fragile: true },
      lines: [
        { productId: 'water_5l', qty: 1 },
        { productId: 'eggs_6', qty: 1 },
        { productId: 'apple', qty: 2 },
        { productId: 'chips_corn', qty: 1 },
        { productId: 'cheese_kasar', qty: 1 },
        { productId: 'lemon', qty: 1 },
      ],
    },
  },
  {
    num: 5,
    mood: 'sunset',
    shoppers: 14,
    tutorial: false,
    order: {
      ...base,
      id: '#1040',
      customer: 'The Garcias',
      address: '9 Sunset Blvd',
      note: 'Weekly shop, thank you!!',
      courier: 'Nina',
      timeLimit: 300,
      bagCount: 3,
      bagCapacity: 4,
      rules: { chemical: true, fragile: true },
      lines: [
        { productId: 'milk_lactose', qty: 1 },
        { productId: 'yogurt', qty: 1 },
        { productId: 'butter', qty: 1 },
        { productId: 'tea', qty: 1 },
        { productId: 'coffee', qty: 1 },
        { productId: 'tomato_paste', qty: 1 },
        { productId: 'cucumber', qty: 2 },
        { productId: 'laundry', qty: 1 },
        { productId: 'toothpaste', qty: 1 },
      ],
    },
  },
  {
    num: 6,
    mood: 'night',
    shoppers: 6,
    tutorial: false,
    order: {
      ...base,
      id: '#1042',
      customer: 'Ayşe K.',
      address: '17 Moda Street, Flat 4',
      note: 'Fresh bread please, and don’t break the eggs 🙏',
      courier: 'Mert',
      timeLimit: 300,
      bagCount: 3,
      bagCapacity: 5,
      rules: { chemical: true, fragile: true },
      lines: [
        { productId: 'milk_full', qty: 1 },
        { productId: 'eggs_10', qty: 1 },
        { productId: 'cheese_white', qty: 1 },
        { productId: 'bread_white', qty: 1 },
        { productId: 'tomato', qty: 1 },
        { productId: 'banana', qty: 1 },
        { productId: 'water_5l', qty: 1 },
        { productId: 'chips_potato', qty: 2 },
        { productId: 'dish_soap', qty: 1 },
      ],
    },
  },
];

export const DEMO_ORDER: OrderDef = LEVELS[5].order;
