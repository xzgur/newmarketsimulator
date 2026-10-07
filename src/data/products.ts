/**
 * Product catalogue. Every product that appears on a display in the store is
 * defined here. Visual parameters are consumed by render/productMeshes.ts,
 * gameplay tags by logic/order.ts.
 */

export type SectionId =
  | 'dairy'
  | 'bakery'
  | 'drinks'
  | 'produce'
  | 'snacks'
  | 'breakfast'
  | 'cleaning'
  | 'care';

export interface SectionDef {
  id: SectionId;
  name: string;
  color: string;
}

export const SECTIONS: Record<SectionId, SectionDef> = {
  dairy: { id: 'dairy', name: 'Süt & Kahvaltılık', color: '#3d8bfd' },
  bakery: { id: 'bakery', name: 'Fırın', color: '#d9822b' },
  drinks: { id: 'drinks', name: 'İçecekler', color: '#17a2b8' },
  produce: { id: 'produce', name: 'Manav', color: '#4caf50' },
  snacks: { id: 'snacks', name: 'Atıştırmalık', color: '#e83e8c' },
  breakfast: { id: 'breakfast', name: 'Konserve & Kahvaltı', color: '#fd7e14' },
  cleaning: { id: 'cleaning', name: 'Temizlik', color: '#6f42c1' },
  care: { id: 'care', name: 'Kişisel Bakım', color: '#20c997' },
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
  | 'can';

export interface ProductDef {
  id: string;
  name: string;
  section: SectionId;
  shape: ProductShape;
  /** Main body colour. */
  color: string;
  /** Secondary colour (cap, band, label background...). */
  accent: string;
  /** Short text printed on the label texture. */
  label?: string;
  /** Approximate size in metres [width, height, depth]. */
  size: [number, number, number];
  tags: Tag[];
}

const P = (d: ProductDef): ProductDef => d;

export const PRODUCTS: ProductDef[] = [
  // --- Süt & Kahvaltılık (fridges, back wall)
  P({ id: 'milk_full', name: 'Tam Yağlı Süt 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#1e63d6', label: 'TAM YAĞLI', size: [0.1, 0.24, 0.1], tags: ['food'] }),
  P({ id: 'milk_half', name: 'Yarım Yağlı Süt 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#2fa84f', label: 'YARIM YAĞLI', size: [0.1, 0.24, 0.1], tags: ['food'] }),
  P({ id: 'milk_lactose', name: 'Laktozsuz Süt 1L', section: 'dairy', shape: 'carton', color: '#ffffff', accent: '#9b59b6', label: 'LAKTOZSUZ', size: [0.1, 0.24, 0.1], tags: ['food'] }),
  P({ id: 'ayran', name: 'Ayran 1L', section: 'dairy', shape: 'bottle', color: '#f4f4f4', accent: '#d62828', label: 'AYRAN', size: [0.09, 0.24, 0.09], tags: ['food'] }),
  P({ id: 'yogurt', name: 'Süzme Yoğurt 1kg', section: 'dairy', shape: 'jar', color: '#fafafa', accent: '#2a9df4', label: 'YOĞURT', size: [0.15, 0.12, 0.15], tags: ['food'] }),
  P({ id: 'cheese_white', name: 'Beyaz Peynir 500g', section: 'dairy', shape: 'block', color: '#fbfbf2', accent: '#2e7d32', label: 'BEYAZ PEYNİR', size: [0.16, 0.07, 0.11], tags: ['food'] }),
  P({ id: 'cheese_kasar', name: 'Kaşar Peyniri 400g', section: 'dairy', shape: 'block', color: '#f6c945', accent: '#b71c1c', label: 'KAŞAR', size: [0.16, 0.07, 0.11], tags: ['food'] }),
  P({ id: 'butter', name: 'Tereyağı 250g', section: 'dairy', shape: 'block', color: '#ffe082', accent: '#f9a825', label: 'TEREYAĞI', size: [0.12, 0.05, 0.08], tags: ['food'] }),
  P({ id: 'eggs_10', name: "Köy Yumurtası 10'lu", section: 'dairy', shape: 'eggbox', color: '#c8a27a', accent: '#f3e3cf', label: "KÖY 10'LU", size: [0.3, 0.08, 0.12], tags: ['food', 'fragile'] }),
  P({ id: 'eggs_6', name: "Yumurta 6'lı", section: 'dairy', shape: 'eggbox', color: '#8fb5d9', accent: '#ffffff', label: "6'LI", size: [0.2, 0.08, 0.12], tags: ['food', 'fragile'] }),
  P({ id: 'olives', name: 'Siyah Zeytin 500g', section: 'dairy', shape: 'jar', color: '#3b3b3b', accent: '#7cb342', label: 'ZEYTİN', size: [0.12, 0.13, 0.12], tags: ['food'] }),

  // --- Fırın
  P({ id: 'bread_white', name: 'Somun Ekmek', section: 'bakery', shape: 'loaf', color: '#d9a35b', accent: '#f1d3a1', size: [0.3, 0.12, 0.14], tags: ['food'] }),
  P({ id: 'bread_whole', name: 'Tam Buğday Ekmeği', section: 'bakery', shape: 'loaf', color: '#7a4b2a', accent: '#a9714a', size: [0.28, 0.12, 0.13], tags: ['food'] }),
  P({ id: 'simit', name: 'Simit', section: 'bakery', shape: 'simit', color: '#b8642b', accent: '#e9d8b4', size: [0.18, 0.04, 0.18], tags: ['food'] }),
  P({ id: 'lavash', name: 'Lavaş 6\'lı', section: 'bakery', shape: 'block', color: '#f1e1c0', accent: '#c0392b', label: 'LAVAŞ', size: [0.24, 0.04, 0.24], tags: ['food'] }),

  // --- İçecekler
  P({ id: 'water_5l', name: 'Su 5L', section: 'drinks', shape: 'jug', color: '#9fd3f5', accent: '#0d47a1', label: 'SU 5L', size: [0.24, 0.34, 0.17], tags: ['food', 'heavy'] }),
  P({ id: 'water_15', name: 'Su 1,5L', section: 'drinks', shape: 'bottle', color: '#b9e2fa', accent: '#0d47a1', label: 'SU', size: [0.09, 0.32, 0.09], tags: ['food'] }),
  P({ id: 'soda', name: 'Maden Suyu 6\'lı', section: 'drinks', shape: 'bottle', color: '#7fd18b', accent: '#c62828', label: 'MADEN S.', size: [0.07, 0.2, 0.07], tags: ['food'] }),
  P({ id: 'cola', name: 'Kola 1L', section: 'drinks', shape: 'bottle', color: '#3a1e14', accent: '#e53935', label: 'KOLA', size: [0.09, 0.3, 0.09], tags: ['food'] }),
  P({ id: 'juice', name: 'Portakal Suyu 1L', section: 'drinks', shape: 'carton', color: '#ff9800', accent: '#fff3e0', label: 'PORTAKAL', size: [0.1, 0.24, 0.1], tags: ['food'] }),

  // --- Manav
  P({ id: 'tomato', name: 'Domates 1kg', section: 'produce', shape: 'round', color: '#e53935', accent: '#2e7d32', size: [0.09, 0.08, 0.09], tags: ['food'] }),
  P({ id: 'apple', name: 'Elma 1kg', section: 'produce', shape: 'round', color: '#c62828', accent: '#6d4c41', size: [0.09, 0.09, 0.09], tags: ['food'] }),
  P({ id: 'orange', name: 'Portakal 1kg', section: 'produce', shape: 'round', color: '#fb8c00', accent: '#33691e', size: [0.1, 0.1, 0.1], tags: ['food'] }),
  P({ id: 'banana', name: 'Muz 1kg', section: 'produce', shape: 'banana', color: '#fdd835', accent: '#5d4037', size: [0.22, 0.08, 0.14], tags: ['food'] }),
  P({ id: 'cucumber', name: 'Salatalık 1kg', section: 'produce', shape: 'long', color: '#2e7d32', accent: '#1b5e20', size: [0.2, 0.05, 0.05], tags: ['food'] }),
  P({ id: 'pepper', name: 'Sivri Biber 500g', section: 'produce', shape: 'long', color: '#7cb342', accent: '#33691e', size: [0.16, 0.035, 0.035], tags: ['food'] }),

  // --- Atıştırmalık
  P({ id: 'chips_potato', name: 'Patates Cipsi', section: 'snacks', shape: 'chips', color: '#ffca28', accent: '#c62828', label: 'PATATES', size: [0.18, 0.24, 0.07], tags: ['food'] }),
  P({ id: 'chips_corn', name: 'Mısır Cipsi', section: 'snacks', shape: 'chips', color: '#ef6c00', accent: '#1a237e', label: 'MISIR', size: [0.18, 0.24, 0.07], tags: ['food'] }),
  P({ id: 'biscuit', name: 'Bisküvi', section: 'snacks', shape: 'box', color: '#8d6e63', accent: '#ffe0b2', label: 'BİSKÜVİ', size: [0.2, 0.06, 0.07], tags: ['food'] }),
  P({ id: 'chocolate', name: 'Sütlü Çikolata', section: 'snacks', shape: 'box', color: '#6a1b9a', accent: '#ffffff', label: 'ÇİKOLATA', size: [0.16, 0.03, 0.08], tags: ['food'] }),
  P({ id: 'nuts', name: 'Karışık Kuruyemiş', section: 'snacks', shape: 'chips', color: '#795548', accent: '#ffd54f', label: 'KURUYEMİŞ', size: [0.15, 0.2, 0.06], tags: ['food'] }),

  // --- Konserve & Kahvaltı
  P({ id: 'jam', name: 'Çilek Reçeli', section: 'breakfast', shape: 'jar', color: '#c2185b', accent: '#ffffff', label: 'REÇEL', size: [0.08, 0.12, 0.08], tags: ['food'] }),
  P({ id: 'honey', name: 'Çiçek Balı', section: 'breakfast', shape: 'jar', color: '#ffb300', accent: '#5d4037', label: 'BAL', size: [0.08, 0.13, 0.08], tags: ['food'] }),
  P({ id: 'cereal', name: 'Mısır Gevreği', section: 'breakfast', shape: 'box', color: '#fbc02d', accent: '#d32f2f', label: 'GEVREK', size: [0.2, 0.28, 0.07], tags: ['food'] }),
  P({ id: 'pasta', name: 'Spagetti Makarna', section: 'breakfast', shape: 'box', color: '#1565c0', accent: '#ffeb3b', label: 'MAKARNA', size: [0.08, 0.26, 0.04], tags: ['food'] }),
  P({ id: 'tuna', name: 'Ton Balığı', section: 'breakfast', shape: 'can', color: '#90a4ae', accent: '#0277bd', label: 'TON', size: [0.09, 0.04, 0.09], tags: ['food'] }),
  P({ id: 'tomato_paste', name: 'Domates Salçası', section: 'breakfast', shape: 'can', color: '#b71c1c', accent: '#ffebee', label: 'SALÇA', size: [0.1, 0.12, 0.1], tags: ['food'] }),

  // --- Temizlik
  P({ id: 'dish_soap', name: 'Bulaşık Deterjanı', section: 'cleaning', shape: 'bottle', color: '#43a047', accent: '#ffeb3b', label: 'BULAŞIK', size: [0.09, 0.26, 0.06], tags: ['chemical'] }),
  P({ id: 'laundry', name: 'Çamaşır Deterjanı', section: 'cleaning', shape: 'box', color: '#1e88e5', accent: '#ffffff', label: 'ÇAMAŞIR', size: [0.26, 0.3, 0.12], tags: ['chemical'] }),
  P({ id: 'softener', name: 'Yumuşatıcı', section: 'cleaning', shape: 'bottle', color: '#f48fb1', accent: '#ad1457', label: 'YUMUŞ.', size: [0.11, 0.28, 0.08], tags: ['chemical'] }),
  P({ id: 'bleach', name: 'Çamaşır Suyu', section: 'cleaning', shape: 'bottle', color: '#eceff1', accent: '#1565c0', label: 'Ç. SUYU', size: [0.11, 0.3, 0.08], tags: ['chemical'] }),
  P({ id: 'sponge', name: 'Bulaşık Süngeri', section: 'cleaning', shape: 'box', color: '#ffee58', accent: '#43a047', label: 'SÜNGER', size: [0.12, 0.04, 0.08], tags: ['chemical'] }),

  // --- Kişisel Bakım
  P({ id: 'shampoo', name: 'Şampuan', section: 'care', shape: 'bottle', color: '#26c6da', accent: '#ffffff', label: 'ŞAMPUAN', size: [0.08, 0.24, 0.05], tags: ['chemical'] }),
  P({ id: 'toothpaste', name: 'Diş Macunu', section: 'care', shape: 'box', color: '#ffffff', accent: '#e53935', label: 'DİŞ', size: [0.18, 0.04, 0.04], tags: ['chemical'] }),
  P({ id: 'soap', name: 'Sıvı Sabun', section: 'care', shape: 'bottle', color: '#ce93d8', accent: '#6a1b9a', label: 'SABUN', size: [0.08, 0.2, 0.06], tags: ['chemical'] }),
  P({ id: 'tissue', name: 'Kağıt Mendil', section: 'care', shape: 'box', color: '#e3f2fd', accent: '#42a5f5', label: 'MENDİL', size: [0.22, 0.1, 0.12], tags: [] }),
];

export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

export function getProduct(id: string): ProductDef {
  const p = PRODUCT_BY_ID[id];
  if (!p) throw new Error(`Unknown product: ${id}`);
  return p;
}
