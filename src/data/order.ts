/** The single order of this demo, as it arrives in the courier app. */

export interface OrderLine {
  productId: string;
  qty: number;
}

export interface OrderDef {
  id: string;
  customer: string;
  address: string;
  note: string;
  distanceKm: number;
  courier: string;
  /** Total time limit in seconds (picking + bagging + handover). */
  timeLimit: number;
  bagCount: number;
  bagCapacity: number;
  /** How many products the player can hold at once (one hand on the cart). */
  trayCapacity: number;
  lines: OrderLine[];
}

export const DEMO_ORDER: OrderDef = {
  id: '#1042',
  customer: 'Ayşe K.',
  address: 'Moda Cad. No:17 D:4, Kadıköy',
  note: 'Ekmek taze olsun lütfen, yumurtalar kırılmasın 🙏',
  distanceKm: 1.8,
  courier: 'Mert',
  timeLimit: 300,
  bagCount: 3,
  bagCapacity: 5,
  trayCapacity: 1,
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
};
