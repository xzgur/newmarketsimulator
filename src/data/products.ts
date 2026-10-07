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
  dairy: { id: 'dairy', name: 'Süt & Kahvaltılık', color: '#3b82f6', aisle: 0 },
  bakery: { id: 'bakery', name: 'Fırın', color: '#e07a2f', aisle: 0 },
  drinks: { id: 'drinks', name: 'İçecekler', color: '#0ea5b7', aisle: 0 },
  produce: { id: 'produce', name: 'Manav', color: '#22a35a', aisle: 0 },
  snacks: { id: 'snacks', name: 'Atıştırmalık', color: '#ec4899', aisle: 1 },
  breakfast: { id: 'breakfast', name: 'Reçel & Konserve', color: '#f97316', aisle: 2 },
  pantry: { id: 'pantry', name: 'Makarna & Bakliyat', color: '#ca8a04', aisle: 3 },
  coffee: { id: 'coffee', name: 'Çay & Kahve', color: '#92400e', aisle: 4 },
  cleaning: { id: 'cleaning', name: 'Temizlik', color: '#7c3aed', aisle: 5 },
  care: { id: 'care', name: 'Kişisel Bakım', color: '#14b8a6', aisle: 6 },
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
  // --- Süt & Kahvaltılık (open chillers, back wall)
  P({ id: 'milk_full', name: 'Tam Yağlı Süt 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#1d5fd1', brand: 'Çayır', label: 'TAM YAĞLI', sub: '1 L', icon: 'cow', size: [0.1, 0.24, 0.1], tags: ['food'], price: 42.5 }),
  P({ id: 'milk_half', name: 'Yarım Yağlı Süt 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#21a34a', brand: 'Çayır', label: 'YARIM YAĞLI', sub: '1 L', icon: 'cow', size: [0.1, 0.24, 0.1], tags: ['food'], price: 40.9 }),
  P({ id: 'milk_lactose', name: 'Laktozsuz Süt 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#9333ea', brand: 'Çayır', label: 'LAKTOZSUZ', sub: '1 L', icon: 'cow', size: [0.1, 0.24, 0.1], tags: ['food'], price: 54.9 }),
  P({ id: 'ayran', name: 'Ayran 1L', section: 'dairy', shape: 'bottle', color: '#f8fafc', accent: '#dc2626', brand: 'Yayla', label: 'AYRAN', sub: '1 L', icon: 'cloud', size: [0.09, 0.24, 0.09], tags: ['food'], price: 32.5 }),
  P({ id: 'yogurt', name: 'Süzme Yoğurt 1kg', section: 'dairy', shape: 'jar', color: '#fafafa', accent: '#2a9df4', brand: 'Yayla', label: 'YOĞURT', sub: '1 kg', icon: 'cloud', size: [0.15, 0.12, 0.15], tags: ['food'], price: 69.9 }),
  P({ id: 'cheese_white', name: 'Beyaz Peynir 500g', section: 'dairy', shape: 'block', color: '#fbfbf2', accent: '#15803d', brand: 'Ezine Usulü', label: 'BEYAZ PEYNİR', sub: '500 g', icon: 'leaf', size: [0.16, 0.07, 0.11], tags: ['food'], price: 129.9 }),
  P({ id: 'cheese_kasar', name: 'Kaşar Peyniri 400g', section: 'dairy', shape: 'block', color: '#f6c945', accent: '#b91c1c', brand: 'Ezine Usulü', label: 'KAŞAR', sub: '400 g', icon: 'star', size: [0.16, 0.07, 0.11], tags: ['food'], price: 149.9 }),
  P({ id: 'butter', name: 'Tereyağı 250g', section: 'dairy', shape: 'block', color: '#ffe082', accent: '#d97706', brand: 'Çayır', label: 'TEREYAĞI', sub: '250 g', icon: 'sun', size: [0.12, 0.05, 0.08], tags: ['food'], price: 119.5 }),
  P({ id: 'eggs_10', name: "Köy Yumurtası 10'lu", section: 'dairy', shape: 'eggbox', color: '#c8a27a', accent: '#7c4a1e', brand: 'Kümes', label: "KÖY 10'LU", sub: 'L boy', icon: 'egg', size: [0.3, 0.08, 0.12], tags: ['food', 'fragile'], price: 74.9 }),
  P({ id: 'eggs_6', name: "Yumurta 6'lı", section: 'dairy', shape: 'eggbox', color: '#8fb5d9', accent: '#1e40af', brand: 'Kümes', label: "6'LI", sub: 'M boy', icon: 'egg', size: [0.2, 0.08, 0.12], tags: ['food', 'fragile'], price: 39.9 }),
  P({ id: 'olives', name: 'Siyah Zeytin 500g', section: 'dairy', shape: 'jar', color: '#3b3b3b', accent: '#65a30d', brand: 'Gemlik Bahçe', label: 'ZEYTİN', sub: '500 g', icon: 'leaf', size: [0.12, 0.13, 0.12], tags: ['food'], price: 98.5 }),

  // --- Fırın
  P({ id: 'bread_white', name: 'Somun Ekmek', section: 'bakery', shape: 'loaf', color: '#d9a35b', accent: '#f1d3a1', size: [0.3, 0.12, 0.14], tags: ['food'], price: 15 }),
  P({ id: 'bread_whole', name: 'Tam Buğday Ekmeği', section: 'bakery', shape: 'loaf', color: '#7a4b2a', accent: '#a9714a', size: [0.28, 0.12, 0.13], tags: ['food'], price: 25 }),
  P({ id: 'simit', name: 'Simit', section: 'bakery', shape: 'simit', color: '#b8642b', accent: '#e9d8b4', size: [0.18, 0.04, 0.18], tags: ['food'], price: 15 }),
  P({ id: 'lavash', name: "Lavaş 6'lı", section: 'bakery', shape: 'block', color: '#f1e1c0', accent: '#c0392b', brand: 'Fırıncı', label: 'LAVAŞ', sub: "6'lı", icon: 'wheat', size: [0.24, 0.04, 0.24], tags: ['food'], price: 29.9 }),
  P({ id: 'buns', name: "Hamburger Ekmeği 4'lü", section: 'bakery', shape: 'kaykit', model: 'food_ingredient_bun', color: '#d9a35b', accent: '#fff', size: [0.11, 0.08, 0.11], tags: ['food'], price: 34.9 }),

  // --- İçecekler
  P({ id: 'water_5l', name: 'Su 5L', section: 'drinks', shape: 'jug', color: '#9fd3f5', accent: '#0b4aa2', brand: 'Nehir', label: 'DOĞAL SU', sub: '5 L', icon: 'drop', size: [0.24, 0.34, 0.17], tags: ['food', 'heavy'], price: 39.9 }),
  P({ id: 'water_15', name: 'Su 1,5L', section: 'drinks', shape: 'bottle', color: '#b9e2fa', accent: '#0b4aa2', brand: 'Nehir', label: 'SU', sub: '1,5 L', icon: 'drop', size: [0.09, 0.32, 0.09], tags: ['food'], price: 12.5 }),
  P({ id: 'soda', name: 'Maden Suyu', section: 'drinks', shape: 'bottle', color: '#7fd18b', accent: '#c62828', brand: 'Kaynak', label: 'MADEN SUYU', sub: '200 ml', icon: 'bubbles', size: [0.07, 0.2, 0.07], tags: ['food'], price: 9.5 }),
  P({ id: 'cola', name: 'Kola 1L', section: 'drinks', shape: 'bottle', color: '#3a1e14', accent: '#e53935', brand: 'Fıkırt', label: 'KOLA', sub: '1 L', icon: 'star', size: [0.09, 0.3, 0.09], tags: ['food'], price: 44.9 }),
  P({ id: 'juice', name: 'Portakal Suyu 1L', section: 'drinks', shape: 'carton', color: '#ff9800', accent: '#fff3e0', brand: 'Bahçe', label: 'PORTAKAL', sub: '1 L', icon: 'fruit', size: [0.1, 0.24, 0.1], tags: ['food'], price: 54.9 }),

  // --- Manav
  P({ id: 'tomato', name: 'Domates 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_tomato', color: '#e53935', accent: '#2e7d32', size: [0.09, 0.085, 0.09], tags: ['food'], price: 34.9 }),
  P({ id: 'potato', name: 'Patates 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_potato', color: '#c49a5a', accent: '#6d4c41', size: [0.08, 0.1, 0.09], tags: ['food'], price: 19.9 }),
  P({ id: 'onion', name: 'Kuru Soğan 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_onion', color: '#c2703d', accent: '#6d4c41', size: [0.09, 0.1, 0.09], tags: ['food'], price: 17.9 }),
  P({ id: 'carrot', name: 'Havuç 1kg', section: 'produce', shape: 'kaykit', model: 'food_ingredient_carrot', color: '#f97316', accent: '#16a34a', size: [0.06, 0.14, 0.06], tags: ['food'], price: 22.5 }),
  P({ id: 'lettuce', name: 'Kıvırcık Marul', section: 'produce', shape: 'kaykit', model: 'food_ingredient_lettuce', color: '#65a30d', accent: '#166534', size: [0.15, 0.11, 0.15], tags: ['food'], price: 24.9 }),
  P({ id: 'apple', name: 'Elma 1kg', section: 'produce', shape: 'round', color: '#c62828', accent: '#6d4c41', size: [0.09, 0.09, 0.09], tags: ['food'], price: 39.9 }),
  P({ id: 'orange', name: 'Portakal 1kg', section: 'produce', shape: 'round', color: '#fb8c00', accent: '#33691e', size: [0.1, 0.1, 0.1], tags: ['food'], price: 32.9 }),
  P({ id: 'lemon', name: 'Limon 500g', section: 'produce', shape: 'round', color: '#facc15', accent: '#3f6212', size: [0.07, 0.08, 0.07], tags: ['food'], price: 19.9 }),
  P({ id: 'banana', name: 'Muz 1kg', section: 'produce', shape: 'banana', color: '#fdd835', accent: '#5d4037', size: [0.22, 0.08, 0.14], tags: ['food'], price: 64.9 }),
  P({ id: 'cucumber', name: 'Salatalık 1kg', section: 'produce', shape: 'long', color: '#2e7d32', accent: '#1b5e20', size: [0.2, 0.05, 0.05], tags: ['food'], price: 27.5 }),
  P({ id: 'pepper', name: 'Sivri Biber 500g', section: 'produce', shape: 'long', color: '#7cb342', accent: '#33691e', size: [0.16, 0.035, 0.035], tags: ['food'], price: 29.9 }),

  // --- Atıştırmalık
  P({ id: 'chips_potato', name: 'Patates Cipsi', section: 'snacks', shape: 'chips', color: '#ffca28', accent: '#c62828', brand: 'Kıtır', label: 'PATATES', sub: 'Klasik', icon: 'flame', size: [0.18, 0.24, 0.07], tags: ['food'], price: 39.9 }),
  P({ id: 'chips_corn', name: 'Mısır Cipsi', section: 'snacks', shape: 'chips', color: '#ef6c00', accent: '#1a237e', brand: 'Kıtır', label: 'MISIR', sub: 'Acılı', icon: 'flame', size: [0.18, 0.24, 0.07], tags: ['food'], price: 39.9 }),
  P({ id: 'biscuit', name: 'Bisküvi', section: 'snacks', shape: 'box', color: '#8d6e63', accent: '#ffe0b2', brand: 'Çıtı', label: 'BİSKÜVİ', sub: 'Kakaolu', icon: 'star', size: [0.2, 0.06, 0.07], tags: ['food'], price: 17.5 }),
  P({ id: 'chocolate', name: 'Sütlü Çikolata', section: 'snacks', shape: 'box', color: '#6a1b9a', accent: '#ffffff', brand: 'Kakao', label: 'ÇİKOLATA', sub: 'Sütlü', icon: 'heart', size: [0.16, 0.03, 0.08], tags: ['food'], price: 32.5 }),
  P({ id: 'nuts', name: 'Karışık Kuruyemiş', section: 'snacks', shape: 'chips', color: '#795548', accent: '#ffd54f', brand: 'Çerezci', label: 'KARIŞIK', sub: '150 g', icon: 'bean', size: [0.15, 0.2, 0.06], tags: ['food'], price: 89.9 }),
  P({ id: 'popcorn', name: 'Patlamış Mısır', section: 'snacks', shape: 'box', color: '#e11d48', accent: '#fef08a', brand: 'Pıtpıt', label: 'POPCORN', sub: '3 x 90 g', icon: 'star', size: [0.17, 0.2, 0.06], tags: ['food'], price: 44.9 }),

  // --- Reçel & Konserve
  P({ id: 'jam', name: 'Çilek Reçeli', section: 'breakfast', shape: 'jar', color: '#c2185b', accent: '#ffffff', brand: 'Anneannem', label: 'ÇİLEK', sub: '380 g', icon: 'fruit', size: [0.08, 0.12, 0.08], tags: ['food'], price: 79.9 }),
  P({ id: 'honey', name: 'Çiçek Balı', section: 'breakfast', shape: 'jar', color: '#ffb300', accent: '#5d4037', brand: 'Petek', label: 'BAL', sub: '460 g', icon: 'sun', size: [0.08, 0.13, 0.08], tags: ['food'], price: 189.9 }),
  P({ id: 'cereal', name: 'Mısır Gevreği', section: 'breakfast', shape: 'box', color: '#fbc02d', accent: '#d32f2f', brand: 'Çıtır', label: 'GEVREK', sub: '450 g', icon: 'sun', size: [0.2, 0.28, 0.07], tags: ['food'], price: 84.9 }),
  P({ id: 'tuna', name: 'Ton Balığı', section: 'breakfast', shape: 'can', color: '#90a4ae', accent: '#0277bd', brand: 'Derin', label: 'TON', sub: '2 x 80 g', icon: 'fish', size: [0.09, 0.04, 0.09], tags: ['food'], price: 109.9 }),
  P({ id: 'tomato_paste', name: 'Domates Salçası', section: 'breakfast', shape: 'can', color: '#b71c1c', accent: '#ffebee', brand: 'Tarla', label: 'SALÇA', sub: '830 g', icon: 'fruit', size: [0.1, 0.12, 0.1], tags: ['food'], price: 69.9 }),
  P({ id: 'ketchup', name: 'Ketçap', section: 'breakfast', shape: 'kaykit', model: 'ketchup', color: '#dc2626', accent: '#fff', size: [0.07, 0.19, 0.07], tags: ['food'], price: 49.9 }),
  P({ id: 'mustard', name: 'Hardal', section: 'breakfast', shape: 'kaykit', model: 'mustard', color: '#facc15', accent: '#fff', size: [0.07, 0.19, 0.07], tags: ['food'], price: 44.9 }),

  // --- Makarna & Bakliyat
  P({ id: 'pasta', name: 'Spagetti Makarna', section: 'pantry', shape: 'box', color: '#1565c0', accent: '#ffeb3b', brand: 'Nonna', label: 'SPAGETTİ', sub: '500 g', icon: 'wheat', size: [0.08, 0.26, 0.04], tags: ['food'], price: 19.9 }),
  P({ id: 'rice', name: 'Baldo Pirinç 1kg', section: 'pantry', shape: 'sack', color: '#f8fafc', accent: '#16a34a', brand: 'Ova', label: 'BALDO', sub: '1 kg', icon: 'wheat', size: [0.14, 0.22, 0.07], tags: ['food'], price: 79.9 }),
  P({ id: 'lentil', name: 'Kırmızı Mercimek 1kg', section: 'pantry', shape: 'sack', color: '#fb923c', accent: '#7c2d12', brand: 'Ova', label: 'MERCİMEK', sub: '1 kg', icon: 'bean', size: [0.14, 0.22, 0.07], tags: ['food'], price: 64.9 }),
  P({ id: 'flour', name: 'Buğday Unu 2kg', section: 'pantry', shape: 'sack', color: '#fefce8', accent: '#ca8a04', brand: 'Değirmen', label: 'UN', sub: '2 kg', icon: 'wheat', size: [0.18, 0.28, 0.09], tags: ['food'], price: 54.9 }),
  P({ id: 'sugar', name: 'Toz Şeker 1kg', section: 'pantry', shape: 'box', color: '#ffffff', accent: '#2563eb', brand: 'Tatlı', label: 'TOZ ŞEKER', sub: '1 kg', icon: 'cloud', size: [0.12, 0.18, 0.07], tags: ['food'], price: 39.9 }),

  // --- Çay & Kahve
  P({ id: 'tea', name: 'Siyah Çay 1kg', section: 'coffee', shape: 'box', color: '#b91c1c', accent: '#fde68a', brand: 'Rize Bağı', label: 'ÇAY', sub: '1 kg', icon: 'leaf', size: [0.14, 0.22, 0.08], tags: ['food'], price: 219.9 }),
  P({ id: 'coffee', name: 'Türk Kahvesi', section: 'coffee', shape: 'chips', color: '#451a03', accent: '#facc15', brand: 'Köpük', label: 'TÜRK KAHVESİ', sub: '100 g', icon: 'cup', size: [0.12, 0.18, 0.05], tags: ['food'], price: 59.9 }),
  P({ id: 'instant', name: 'Hazır Kahve', section: 'coffee', shape: 'jar', color: '#78350f', accent: '#f8fafc', brand: 'Köpük', label: 'GOLD', sub: '100 g', icon: 'cup', size: [0.09, 0.14, 0.09], tags: ['food'], price: 139.9 }),
  P({ id: 'herbal', name: 'Ihlamur Çayı', section: 'coffee', shape: 'box', color: '#84cc16', accent: '#14532d', brand: 'Rize Bağı', label: 'IHLAMUR', sub: '20 poşet', icon: 'leaf', size: [0.14, 0.08, 0.07], tags: ['food'], price: 34.9 }),

  // --- Temizlik
  P({ id: 'dish_soap', name: 'Bulaşık Deterjanı', section: 'cleaning', shape: 'bottle', color: '#43a047', accent: '#ffeb3b', brand: 'Parıl', label: 'BULAŞIK', sub: '750 ml', icon: 'bubbles', size: [0.09, 0.26, 0.06], tags: ['chemical'], price: 59.9 }),
  P({ id: 'laundry', name: 'Çamaşır Deterjanı', section: 'cleaning', shape: 'box', color: '#1e88e5', accent: '#ffffff', brand: 'Parıl', label: 'ÇAMAŞIR', sub: '4 kg', icon: 'bubbles', size: [0.26, 0.3, 0.12], tags: ['chemical'], price: 249.9 }),
  P({ id: 'softener', name: 'Yumuşatıcı', section: 'cleaning', shape: 'bottle', color: '#f48fb1', accent: '#ad1457', brand: 'Pamuk', label: 'YUMUŞATICI', sub: '1,5 L', icon: 'cloud', size: [0.11, 0.28, 0.08], tags: ['chemical'], price: 89.9 }),
  P({ id: 'bleach', name: 'Çamaşır Suyu', section: 'cleaning', shape: 'bottle', color: '#eceff1', accent: '#1565c0', brand: 'Parıl', label: 'Ç. SUYU', sub: '2 L', icon: 'drop', size: [0.11, 0.3, 0.08], tags: ['chemical'], price: 49.9 }),
  P({ id: 'sponge', name: 'Bulaşık Süngeri', section: 'cleaning', shape: 'box', color: '#ffee58', accent: '#43a047', brand: 'Parıl', label: 'SÜNGER', sub: "3'lü", icon: 'star', size: [0.12, 0.04, 0.08], tags: ['chemical'], price: 24.9 }),
  P({ id: 'papertowel', name: 'Kağıt Havlu', section: 'cleaning', shape: 'kaykit', model: 'papertowel', color: '#fff', accent: '#fff', size: [0.13, 0.24, 0.13], tags: [], price: 69.9 }),

  // --- Kişisel Bakım
  P({ id: 'shampoo', name: 'Şampuan', section: 'care', shape: 'bottle', color: '#26c6da', accent: '#ffffff', brand: 'Saçım', label: 'ŞAMPUAN', sub: '500 ml', icon: 'drop', size: [0.08, 0.24, 0.05], tags: ['chemical'], price: 89.9 }),
  P({ id: 'toothpaste', name: 'Diş Macunu', section: 'care', shape: 'box', color: '#ffffff', accent: '#e53935', brand: 'Işıl', label: 'DİŞ MACUNU', sub: '75 ml', icon: 'tooth', size: [0.18, 0.04, 0.04], tags: ['chemical'], price: 64.9 }),
  P({ id: 'soap', name: 'Sıvı Sabun', section: 'care', shape: 'bottle', color: '#ce93d8', accent: '#6a1b9a', brand: 'Pamuk', label: 'SABUN', sub: '400 ml', icon: 'heart', size: [0.08, 0.2, 0.06], tags: ['chemical'], price: 44.9 }),
  P({ id: 'tissue', name: 'Kağıt Mendil', section: 'care', shape: 'box', color: '#e3f2fd', accent: '#42a5f5', brand: 'Pamuk', label: 'MENDİL', sub: "10'lu", icon: 'cloud', size: [0.22, 0.1, 0.12], tags: [], price: 29.9 }),
];

export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): ProductDef {
  const p = PRODUCT_BY_ID[id];
  if (!p) throw new Error(`Unknown product: ${id}`);
  return p;
}

export function formatPrice(v: number): string {
  return `${v.toFixed(2).replace('.', ',')} TL`;
}
