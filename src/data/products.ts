/**
 * Product catalogue. Every product that appears on a display is defined here.
 * Visual parameters are consumed by render/productMeshes.ts, gameplay tags by
 * logic/order.ts. Brands are fictional.
 */

export type SectionId =
  | 'dairy'
  | 'bakery'
  | 'drinks'
  | 'produce'
  | 'snacks'
  | 'breakfast'
  | 'pantry'
  | 'coffee'
  | 'cleaning'
  | 'care';

export interface SectionDef {
  id: SectionId;
  name: string;
  color: string;
  /** Aisle number shown on the hanging signs (0 = wall section). */
  aisle: number;
}

export const SECTIONS: Record<SectionId, SectionDef> = {
  dairy: { id: 'dairy', name: 'Dairy & Eggs', color: '#3FA2F7', aisle: 0 },
  bakery: { id: 'bakery', name: 'Bakery', color: '#FF8F3A', aisle: 0 },
  drinks: { id: 'drinks', name: 'Drinks', color: '#22BFB0', aisle: 0 },
  produce: { id: 'produce', name: 'Fresh Produce', color: '#4FBF5A', aisle: 0 },
  snacks: { id: 'snacks', name: 'Snacks', color: '#FF5FA8', aisle: 1 },
  breakfast: { id: 'breakfast', name: 'Jams & Cans', color: '#FF5B4F', aisle: 2 },
  pantry: { id: 'pantry', name: 'Pasta & Grains', color: '#F5B32E', aisle: 3 },
  coffee: { id: 'coffee', name: 'Tea & Coffee', color: '#B9733F', aisle: 4 },
  cleaning: { id: 'cleaning', name: 'Cleaning', color: '#7C5CFF', aisle: 5 },
  care: { id: 'care', name: 'Personal Care', color: '#16A3A0', aisle: 6 },
};

/** Gameplay tags used by the bagging rules. */
export type Tag = 'food' | 'chemical' | 'heavy' | 'fragile';

export type ProductShape =
  | 'carton'
  | 'bottle'
  | 'jug'
  | 'eggbox'
  | 'block'
  | 'loaf'
  | 'simit'
  | 'round'
  | 'banana'
  | 'long'
  | 'box'
  | 'chips'
  | 'jar'
  | 'can'
  | 'sack'
  | 'kaykit';

export type LabelIcon =
  | 'cow'
  | 'drop'
  | 'egg'
  | 'leaf'
  | 'flame'
  | 'bubbles'
  | 'star'
  | 'sun'
  | 'wheat'
  | 'bean'
  | 'cup'
  | 'fruit'
  | 'fish'
  | 'heart'
  | 'tooth'
  | 'cloud'
  | 'none';

export interface ProductDef {
  id: string;
  name: string;
  section: SectionId;
  shape: ProductShape;
  /** Main body colour. */
  color: string;
  /** Secondary colour (cap, band, label background...). */
  accent: string;
  /** Fictional brand printed on the label. */
  brand?: string;
  /** Big text on the label (variant). */
  label?: string;
  /** Small text on the label (amount). */
  sub?: string;
  icon?: LabelIcon;
  /** Approximate size in metres [width, height, depth]. */
  size: [number, number, number];
  /** KayKit model name for shape 'kaykit'. */
  model?: string;
  tags: Tag[];
  price: number;
}

const P = (d: ProductDef): ProductDef => d;

export const PRODUCTS: ProductDef[] = [
  // --- Dairy & eggs (open chillers, back wall)
  P({ id: 'milk_full', name: 'Whole Milk 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#1d5fd1', brand: 'Meadow', label: 'WHOLE', sub: '1 L', icon: 'cow', size: [0.1, 0.24, 0.1], tags: ['food'], price: 42.5 }),
  P({ id: 'milk_half', name: 'Semi-Skimmed Milk 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#21a34a', brand: 'Meadow', label: 'SEMI-SKIMMED', sub: '1 L', icon: 'cow', size: [0.1, 0.24, 0.1], tags: ['food'], price: 40.9 }),
  P({ id: 'milk_lactose', name: 'Lactose-Free Milk 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#9333ea', brand: 'Meadow', label: 'LACTOSE FREE', sub: '1 L', icon: 'cow', size: [0.1, 0.24, 0.1], tags: ['food'], price: 54.9 }),
  P({ id: 'ayran', name: 'Ayran Yogurt Drink', section: 'dairy', shape: 'bottle', color: '#f8fafc', accent: '#dc2626', brand: 'Highland', label: 'AYRAN', sub: '1 L', icon: 'cloud', size: [0.09, 0.24, 0.09], tags: ['food'], price: 32.5 }),
  P({ id: 'yogurt', name: 'Greek Yogurt 1kg', section: 'dairy', shape: 'jar', color: '#fafafa', accent: '#2a9df4', brand: 'Highland', label: 'GREEK YOGURT', sub: '1 kg', icon: 'cloud', size: [0.15, 0.12, 0.15], tags: ['food'], price: 69.9 }),
  P({ id: 'cheese_white', name: 'Feta Cheese 500g', section: 'dairy', shape: 'block', color: '#fbfbf2', accent: '#15803d', brand: 'Old Farm', label: 'FETA', sub: '500 g', icon: 'leaf', size: [0.16, 0.07, 0.11], tags: ['food'], price: 129.9 }),
  P({ id: 'cheese_kasar', name: 'Cheddar Cheese 400g', section: 'dairy', shape: 'block', color: '#f6c945', accent: '#b91c1c', brand: 'Old Farm', label: 'CHEDDAR', sub: '400 g', icon: 'star', size: [0.16, 0.07, 0.11], tags: ['food'], price: 149.9 }),
  P({ id: 'butter', name: 'Butter 250g', section: 'dairy', shape: 'block', color: '#ffe082', accent: '#d97706', brand: 'Meadow', label: 'BUTTER', sub: '250 g', icon: 'sun', size: [0.12, 0.05, 0.08], tags: ['food'], price: 119.5 }),
  P({ id: 'eggs_10', name: 'Free-Range Eggs x10', section: 'dairy', shape: 'eggbox', color: '#c8a27a', accent: '#7c4a1e', brand: 'Henhouse', label: 'FREE RANGE', sub: 'Large', icon: 'egg', size: [0.3, 0.08, 0.12], tags: ['food', 'fragile'], price: 74.9 }),
  P({ id: 'eggs_6', name: 'Eggs x6', section: 'dairy', shape: 'eggbox', color: '#8fb5d9', accent: '#1e40af', brand: 'Henhouse', label: '6 EGGS', sub: 'Medium', icon: 'egg', size: [0.2, 0.08, 0.12], tags: ['food', 'fragile'], price: 39.9 }),
  P({ id: 'olives', name: 'Black Olives 500g', section: 'dairy', shape: 'jar', color: '#3b3b3b', accent: '#65a30d', brand: 'Olive Grove', label: 'OLIVES', sub: '500 g', icon: 'leaf', size: [0.12, 0.13, 0.12], tags: ['food'], price: 98.5 }),

  // --- Bakery
  P({ id: 'bread_white', name: 'White Loaf', section: 'bakery', shape: 'loaf', color: '#d9a35b', accent: '#f1d3a1', size: [0.3, 0.12, 0.14], tags: ['food'], price: 15 }),
  P({ id: 'bread_whole', name: 'Wholewheat Loaf', section: 'bakery', shape: 'loaf', color: '#7a4b2a', accent: '#a9714a', size: [0.28, 0.12, 0.13], tags: ['food'], price: 25 }),
  P({ id: 'simit', name: 'Sesame Bagel', section: 'bakery', shape: 'simit', color: '#b8642b', accent: '#e9d8b4', size: [0.18, 0.04, 0.18], tags: ['food'], price: 15 }),
  P({ id: 'lavash', name: 'Flatbread x6', section: 'bakery', shape: 'block', color: '#f1e1c0', accent: '#c0392b', brand: 'Baker Bros', label: 'FLATBREAD', sub: '6 pack', icon: 'wheat', size: [0.24, 0.04, 0.24], tags: ['food'], price: 29.9 }),
  P({ id: 'buns', name: 'Burger Buns x4', section: 'bakery', shape: 'kaykit', model: 'food_ingredient_bun', color: '#d9a35b', accent: '#fff', size: [0.11, 0.08, 0.11], tags: ['food'], price: 34.9 }),

  // --- Drinks
  P({ id: 'water_5l', name: 'Water 5L', section: 'drinks', shape: 'jug', color: '#9fd3f5', accent: '#0b4aa2', brand: 'River', label: 'SPRING WATER', sub: '5 L', icon: 'drop', size: [0.24, 0.34, 0.17], tags: ['food', 'heavy'], price: 39.9 }),
  P({ id: 'water_15', name: 'Water 1.5L', section: 'drinks', shape: 'bottle', color: '#b9e2fa', accent: '#0b4aa2', brand: 'River', label: 'WATER', sub: '1.5 L', icon: 'drop', size: [0.09, 0.32, 0.09], tags: ['food'], price: 12.5 }),
  P({ id: 'soda', name: 'Sparkling Water', section: 'drinks', shape: 'bottle', color: '#7fd18b', accent: '#c62828', brand: 'Spring', label: 'SPARKLING', sub: '200 ml', icon: 'bubbles', size: [0.07, 0.2, 0.07], tags: ['food'], price: 9.5 }),
  P({ id: 'cola', name: 'Cola 1L', section: 'drinks', shape: 'bottle', color: '#3a1e14', accent: '#e53935', brand: 'Fizzy', label: 'COLA', sub: '1 L', icon: 'star', size: [0.09, 0.3, 0.09], tags: ['food'], price: 44.9 }),
  P({ id: 'juice', name: 'Orange Juice 1L', section: 'drinks', shape: 'carton', color: '#ff9800', accent: '#fff3e0', brand: 'Orchard', label: 'ORANGE', sub: '1 L', icon: 'fruit', size: [0.1, 0.24, 0.1], tags: ['food'], price: 54.9 }),

  // --- Produce
  P({ id: 'tomato', name: 'Tomatoes 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_tomato', color: '#e53935', accent: '#2e7d32', size: [0.09, 0.085, 0.09], tags: ['food'], price: 34.9 }),
  P({ id: 'potato', name: 'Potatoes 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_potato', color: '#c49a5a', accent: '#6d4c41', size: [0.08, 0.1, 0.09], tags: ['food'], price: 19.9 }),
  P({ id: 'onion', name: 'Onions 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_onion', color: '#c2703d', accent: '#6d4c41', size: [0.09, 0.1, 0.09], tags: ['food'], price: 17.9 }),
  P({ id: 'carrot', name: 'Carrots 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_carrot', color: '#f97316', accent: '#16a34a', size: [0.06, 0.14, 0.06], tags: ['food'], price: 22.5 }),
  P({ id: 'lettuce', name: 'Lettuce', section: 'produce', shape: 'kaykit', model: 'food_ingredient_lettuce', color: '#65a30d', accent: '#166534', size: [0.15, 0.11, 0.15], tags: ['food'], price: 24.9 }),
  P({ id: 'apple', name: 'Apples 1kg', section: 'produce', shape: 'round', color: '#c62828', accent: '#6d4c41', size: [0.09, 0.09, 0.09], tags: ['food'], price: 39.9 }),
  P({ id: 'orange', name: 'Oranges 1kg', section: 'produce', shape: 'round', color: '#fb8c00', accent: '#33691e', size: [0.1, 0.1, 0.1], tags: ['food'], price: 32.9 }),
  P({ id: 'lemon', name: 'Lemons 500g', section: 'produce', shape: 'round', color: '#facc15', accent: '#3f6212', size: [0.07, 0.08, 0.07], tags: ['food'], price: 19.9 }),
  P({ id: 'banana', name: 'Bananas 1kg', section: 'produce', shape: 'banana', color: '#fdd835', accent: '#5d4037', size: [0.22, 0.08, 0.14], tags: ['food'], price: 64.9 }),
  P({ id: 'cucumber', name: 'Cucumbers 1kg', section: 'produce', shape: 'long', color: '#2e7d32', accent: '#1b5e20', size: [0.2, 0.05, 0.05], tags: ['food'], price: 27.5 }),
  P({ id: 'pepper', name: 'Green Peppers', section: 'produce', shape: 'long', color: '#7cb342', accent: '#33691e', size: [0.16, 0.035, 0.035], tags: ['food'], price: 29.9 }),

  // --- Snacks
  P({ id: 'chips_potato', name: 'Potato Chips', section: 'snacks', shape: 'chips', color: '#ffca28', accent: '#c62828', brand: 'Krunch', label: 'CLASSIC', sub: 'Salted', icon: 'flame', size: [0.18, 0.24, 0.07], tags: ['food'], price: 39.9 }),
  P({ id: 'chips_corn', name: 'Corn Chips', section: 'snacks', shape: 'chips', color: '#ef6c00', accent: '#1a237e', brand: 'Krunch', label: 'NACHO', sub: 'Spicy', icon: 'flame', size: [0.18, 0.24, 0.07], tags: ['food'], price: 39.9 }),
  P({ id: 'biscuit', name: 'Cocoa Biscuits', section: 'snacks', shape: 'box', color: '#8d6e63', accent: '#ffe0b2', brand: 'Crumbs', label: 'COOKIES', sub: 'Cocoa', icon: 'star', size: [0.2, 0.06, 0.07], tags: ['food'], price: 17.5 }),
  P({ id: 'chocolate', name: 'Milk Chocolate', section: 'snacks', shape: 'box', color: '#6a1b9a', accent: '#ffffff', brand: 'Cocoa Co', label: 'CHOCOLATE', sub: 'Milk', icon: 'heart', size: [0.16, 0.03, 0.08], tags: ['food'], price: 32.5 }),
  P({ id: 'nuts', name: 'Mixed Nuts', section: 'snacks', shape: 'chips', color: '#795548', accent: '#ffd54f', brand: 'Nutty', label: 'MIXED NUTS', sub: '150 g', icon: 'bean', size: [0.15, 0.2, 0.06], tags: ['food'], price: 89.9 }),
  P({ id: 'popcorn', name: 'Popcorn', section: 'snacks', shape: 'box', color: '#e11d48', accent: '#fef08a', brand: 'Pop Pop', label: 'POPCORN', sub: '3 x 90 g', icon: 'star', size: [0.17, 0.2, 0.06], tags: ['food'], price: 44.9 }),

  // --- Jams & cans
  P({ id: 'jam', name: 'Strawberry Jam', section: 'breakfast', shape: 'jar', color: '#c2185b', accent: '#ffffff', brand: 'Granny', label: 'STRAWBERRY', sub: '380 g', icon: 'fruit', size: [0.08, 0.12, 0.08], tags: ['food'], price: 79.9 }),
  P({ id: 'honey', name: 'Flower Honey', section: 'breakfast', shape: 'jar', color: '#ffb300', accent: '#5d4037', brand: 'Honeycomb', label: 'HONEY', sub: '460 g', icon: 'sun', size: [0.08, 0.13, 0.08], tags: ['food'], price: 189.9 }),
  P({ id: 'cereal', name: 'Corn Flakes', section: 'breakfast', shape: 'box', color: '#fbc02d', accent: '#d32f2f', brand: 'Sunny', label: 'CORN FLAKES', sub: '450 g', icon: 'sun', size: [0.2, 0.28, 0.07], tags: ['food'], price: 84.9 }),
  P({ id: 'tuna', name: 'Canned Tuna', section: 'breakfast', shape: 'can', color: '#90a4ae', accent: '#0277bd', brand: 'Deep Blue', label: 'TUNA', sub: '2 x 80 g', icon: 'fish', size: [0.09, 0.04, 0.09], tags: ['food'], price: 109.9 }),
  P({ id: 'tomato_paste', name: 'Tomato Paste', section: 'breakfast', shape: 'can', color: '#b71c1c', accent: '#ffebee', brand: 'Field', label: 'TOMATO PASTE', sub: '830 g', icon: 'fruit', size: [0.1, 0.12, 0.1], tags: ['food'], price: 69.9 }),
  P({ id: 'ketchup', name: 'Ketchup', section: 'breakfast', shape: 'kaykit', model: 'ketchup', color: '#dc2626', accent: '#fff', size: [0.07, 0.19, 0.07], tags: ['food'], price: 49.9 }),
  P({ id: 'mustard', name: 'Mustard', section: 'breakfast', shape: 'kaykit', model: 'mustard', color: '#facc15', accent: '#fff', size: [0.07, 0.19, 0.07], tags: ['food'], price: 44.9 }),

  // --- Pasta & grains
  P({ id: 'pasta', name: 'Spaghetti', section: 'pantry', shape: 'box', color: '#1565c0', accent: '#ffeb3b', brand: 'Nonna', label: 'SPAGHETTI', sub: '500 g', icon: 'wheat', size: [0.08, 0.26, 0.04], tags: ['food'], price: 19.9 }),
  P({ id: 'rice', name: 'Rice 1kg', section: 'pantry', shape: 'sack', color: '#f8fafc', accent: '#16a34a', brand: 'Valley', label: 'RICE', sub: '1 kg', icon: 'wheat', size: [0.14, 0.22, 0.07], tags: ['food'], price: 79.9 }),
  P({ id: 'lentil', name: 'Red Lentils 1kg', section: 'pantry', shape: 'sack', color: '#fb923c', accent: '#7c2d12', brand: 'Valley', label: 'RED LENTILS', sub: '1 kg', icon: 'bean', size: [0.14, 0.22, 0.07], tags: ['food'], price: 64.9 }),
  P({ id: 'flour', name: 'Flour 2kg', section: 'pantry', shape: 'sack', color: '#fefce8', accent: '#ca8a04', brand: 'Mill', label: 'FLOUR', sub: '2 kg', icon: 'wheat', size: [0.18, 0.28, 0.09], tags: ['food'], price: 54.9 }),
  P({ id: 'sugar', name: 'Sugar 1kg', section: 'pantry', shape: 'box', color: '#ffffff', accent: '#2563eb', brand: 'Sweet', label: 'SUGAR', sub: '1 kg', icon: 'cloud', size: [0.12, 0.18, 0.07], tags: ['food'], price: 39.9 }),

  // --- Tea & coffee
  P({ id: 'tea', name: 'Black Tea 1kg', section: 'coffee', shape: 'box', color: '#b91c1c', accent: '#fde68a', brand: 'Leafy', label: 'BLACK TEA', sub: '1 kg', icon: 'leaf', size: [0.14, 0.22, 0.08], tags: ['food'], price: 219.9 }),
  P({ id: 'coffee', name: 'Tea & Coffee', section: 'coffee', shape: 'chips', color: '#451a03', accent: '#facc15', brand: 'Crema', label: 'COFFEE', sub: '100 g', icon: 'cup', size: [0.12, 0.18, 0.05], tags: ['food'], price: 59.9 }),
  P({ id: 'instant', name: 'Instant Coffee', section: 'coffee', shape: 'jar', color: '#78350f', accent: '#f8fafc', brand: 'Crema', label: 'GOLD', sub: '100 g', icon: 'cup', size: [0.09, 0.14, 0.09], tags: ['food'], price: 139.9 }),
  P({ id: 'herbal', name: 'Linden Tea', section: 'coffee', shape: 'box', color: '#84cc16', accent: '#14532d', brand: 'Leafy', label: 'LINDEN', sub: '20 bags', icon: 'leaf', size: [0.14, 0.08, 0.07], tags: ['food'], price: 34.9 }),

  // --- Cleaning
  P({ id: 'dish_soap', name: 'Dish Soap', section: 'cleaning', shape: 'bottle', color: '#43a047', accent: '#ffeb3b', brand: 'Sparkle', label: 'DISH SOAP', sub: '750 ml', icon: 'bubbles', size: [0.09, 0.26, 0.06], tags: ['chemical'], price: 59.9 }),
  P({ id: 'laundry', name: 'Laundry Powder', section: 'cleaning', shape: 'box', color: '#1e88e5', accent: '#ffffff', brand: 'Sparkle', label: 'LAUNDRY', sub: '4 kg', icon: 'bubbles', size: [0.26, 0.3, 0.12], tags: ['chemical'], price: 249.9 }),
  P({ id: 'softener', name: 'Fabric Softener', section: 'cleaning', shape: 'bottle', color: '#f48fb1', accent: '#ad1457', brand: 'Cotton', label: 'SOFTENER', sub: '1.5 L', icon: 'cloud', size: [0.11, 0.28, 0.08], tags: ['chemical'], price: 89.9 }),
  P({ id: 'bleach', name: 'Bleach', section: 'cleaning', shape: 'bottle', color: '#eceff1', accent: '#1565c0', brand: 'Sparkle', label: 'BLEACH', sub: '2 L', icon: 'drop', size: [0.11, 0.3, 0.08], tags: ['chemical'], price: 49.9 }),
  P({ id: 'sponge', name: 'Sponges x3', section: 'cleaning', shape: 'box', color: '#ffee58', accent: '#43a047', brand: 'Sparkle', label: 'SPONGES', sub: '3 pack', icon: 'star', size: [0.12, 0.04, 0.08], tags: ['chemical'], price: 24.9 }),
  P({ id: 'papertowel', name: 'Paper Towels', section: 'cleaning', shape: 'kaykit', model: 'papertowel', color: '#fff', accent: '#fff', size: [0.13, 0.24, 0.13], tags: [], price: 69.9 }),

  // --- Personal care
  P({ id: 'shampoo', name: 'Shampoo', section: 'care', shape: 'bottle', color: '#26c6da', accent: '#ffffff', brand: 'Silky', label: 'SHAMPOO', sub: '500 ml', icon: 'drop', size: [0.08, 0.24, 0.05], tags: ['chemical'], price: 89.9 }),
  P({ id: 'toothpaste', name: 'Toothpaste', section: 'care', shape: 'box', color: '#ffffff', accent: '#e53935', brand: 'Bright', label: 'TOOTHPASTE', sub: '75 ml', icon: 'tooth', size: [0.18, 0.04, 0.04], tags: ['chemical'], price: 64.9 }),
  P({ id: 'soap', name: 'Liquid Soap', section: 'care', shape: 'bottle', color: '#ce93d8', accent: '#6a1b9a', brand: 'Cotton', label: 'HAND SOAP', sub: '400 ml', icon: 'heart', size: [0.08, 0.2, 0.06], tags: ['chemical'], price: 44.9 }),
  P({ id: 'tissue', name: 'Tissues', section: 'care', shape: 'box', color: '#e3f2fd', accent: '#42a5f5', brand: 'Cotton', label: 'TISSUES', sub: '10 pack', icon: 'cloud', size: [0.22, 0.1, 0.12], tags: [], price: 29.9 }),
];

export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): ProductDef {
  const p = PRODUCT_BY_ID[id];
  if (!p) throw new Error(`Unknown product: ${id}`);
  return p;
}

export function formatPrice(v: number): string {
  return `$${(v / 30).toFixed(2)}`;
}
