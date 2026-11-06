/**
 * Simulated storefront catalog for the autonomous checkout demo.
 *
 * In-memory seed data stands in for a real merchant inventory. Each product
 * carries a `floorPrice` — the minimum the seller agent will ever accept — which
 * powers the negotiation side of the demo. Swap this module for a DB/merchant
 * API in production without touching the agent layer.
 */
export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Merchant's asking price (USD). */
  listPrice: number;
  /** Private minimum price the seller agent accepts (USD). */
  floorPrice: number;
  currency: "USD";
  stock: number;
  /** Whether the seller agent may negotiate below list price. */
  negotiable: boolean;
}

export const CATALOG: CatalogProduct[] = [
  {
    id: "kb-nova75",
    name: "Nova75 Hot-Swap Mechanical Keyboard",
    category: "Peripherals",
    description: "75% hot-swappable keyboard with gasket mount, RGB and wireless 2.4GHz/BT.",
    listPrice: 129.99,
    floorPrice: 88,
    currency: "USD",
    stock: 14,
    negotiable: true,
  },
  {
    id: "kb-kepler",
    name: "Kepler TKL Mechanical Keyboard",
    category: "Peripherals",
    description: "Tenkeyless mechanical keyboard, red switches, aluminium frame.",
    listPrice: 89,
    floorPrice: 62,
    currency: "USD",
    stock: 30,
    negotiable: true,
  },
  {
    id: "mouse-lynx",
    name: "Lynx Wireless Ergonomic Mouse",
    category: "Peripherals",
    description: "Vertical ergonomic mouse, silent clicks, 6-week battery life.",
    listPrice: 49,
    floorPrice: 31,
    currency: "USD",
    stock: 45,
    negotiable: true,
  },
  {
    id: "hub-titan",
    name: "Titan 11-in-1 USB-C Hub",
    category: "Accessories",
    description: "Dual HDMI, 100W pass-through, gigabit ethernet and SD card reader.",
    listPrice: 59.99,
    floorPrice: 41,
    currency: "USD",
    stock: 22,
    negotiable: true,
  },
  {
    id: "audio-pinna2",
    name: "Pinna-2 Studio Headphones",
    category: "Audio",
    description: "Closed-back reference monitor headphones with 50mm drivers.",
    listPrice: 159,
    floorPrice: 110,
    currency: "USD",
    stock: 9,
    negotiable: true,
  },
  {
    id: "cam-iris",
    name: "Iris 4K Webcam",
    category: "Video",
    description: "4K30 webcam with autofocus, HDR and privacy shutter.",
    listPrice: 79,
    floorPrice: 52,
    currency: "USD",
    stock: 18,
    negotiable: true,
  },
  {
    id: "lamp-halo",
    name: "Halo Smart Desk Lamp",
    category: "Workspace",
    description: "Eye-care LED desk lamp with auto-dimming and USB-C charging port.",
    listPrice: 64,
    floorPrice: 43,
    currency: "USD",
    stock: 27,
    negotiable: true,
  },
  {
    id: "desk-aero",
    name: "AeroDesk Compact Standing Desk",
    category: "Workspace",
    description: "Motorized sit-stand desk with 4 presets, 90x60cm top.",
    listPrice: 249,
    floorPrice: 190,
    currency: "USD",
    stock: 5,
    negotiable: true,
  },
];
