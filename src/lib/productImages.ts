import type { Product } from "@/lib/types";

export interface ProductPhoto {
  src: string;
  column: number;
  row: number;
  columns: number;
  rows: number;
}

const sheets = {
  desserts: "/product-images/desserts-menu.png",
  hotCoffee: "/product-images/hot-coffee-menu.png",
  coldDrinks: "/product-images/cold-drinks-menu.png",
  fruitMatcha: "/product-images/fruit-matcha-menu.png",
} as const;

function tile(src: string, index: number, columns = 4, rows = 4): ProductPhoto {
  return { src, column: index % columns, row: Math.floor(index / columns), columns, rows };
}

function key(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Default photo for each menu item; a URL explicitly saved on the product always takes precedence. */
export function productMenuPhoto(product: Product, categoryName: string): ProductPhoto | undefined {
  const category = key(categoryName);
  const name = key(product.name.en);

  if (category.includes("cheesecake")) {
    const index = name.includes("blueberry") ? 3 : name.includes("chocolate") ? 4 : name.includes("pistachio") ? 5 : 2;
    return tile(sheets.desserts, index);
  }
  if (category.includes("bakery")) {
    return tile(sheets.desserts, name.includes("zaatar") || name.includes("cheese") ? 7 : 6);
  }
  if (category.includes("sweet")) {
    return tile(sheets.desserts, name.includes("cookie") ? 1 : 0);
  }
  if (category.includes("pop")) {
    const index = name.includes("white") ? 9 : name.includes("pistachio") ? 10 : name.includes("lotus") ? 11 : name.includes("mix") ? 12 : 8;
    return tile(sheets.desserts, index);
  }
  if (category.includes("bundle")) {
    const index = name.includes("specialty") ? 14 : name.includes("healthy") ? 15 : 13;
    return tile(sheets.desserts, index);
  }
  if (category.includes("specialty brew")) {
    return tile(sheets.hotCoffee, name.includes("hazelnut") ? 13 : 14);
  }
  if (category.includes("espresso")) {
    const coffeeTiles: Record<string, number> = {
      espresso: 0,
      americano: 1,
      latte: 2,
      cappuccino: 3,
      "flat white": 4,
      cortado: 5,
      macchiato: 6,
      "spanish latte": 7,
      "white mocha": 8,
      "caramel/vanilla": 9,
      "caramel macchiato": 10,
      pistachio: 11,
      "salted caramel": 12,
    };
    return tile(sheets.hotCoffee, coffeeTiles[name] ?? 2);
  }
  if (category.includes("iced coffee")) {
    const icedTiles: Record<string, number> = {
      latte: 0,
      "spanish latte": 1,
      "white mocha": 2,
      mocha: 3,
      "dulce de leche": 4,
      pistachio: 5,
      "salted caramel": 6,
      "caramel macchiato": 7,
    };
    return tile(sheets.coldDrinks, icedTiles[name] ?? 0);
  }
  if (category.includes("non coffee")) {
    const drinkTiles: Record<string, number> = {
      "hot chocolate": 8,
      "iced chocolate": 9,
      "iced tea": 10,
      "pink lemonade": 11,
      "blue passion": 12,
      "blueberry shake": 13,
      redbull: 14,
      "mineral water": 15,
    };
    return tile(sheets.coldDrinks, drinkTiles[name] ?? 8);
  }
  if (category.includes("mojito")) {
    const fruitTiles: Record<string, number> = {
      blueberry: 0,
      "passion fruit": 1,
      kiwi: 2,
      cherry: 3,
      "blue curacao": 4,
      "mojito redbull": 5,
    };
    return tile(sheets.fruitMatcha, fruitTiles[name] ?? 0);
  }
  if (category.includes("boba")) return tile(sheets.fruitMatcha, 6);
  if (category.includes("matcha")) {
    const matchaTiles: Record<string, number> = {
      "honey matcha": 7,
      "coconut matcha": 8,
      "blended matcha": 9,
      "banana bread matcha": 10,
    };
    return tile(sheets.fruitMatcha, matchaTiles[name] ?? 7);
  }

  return undefined;
}
