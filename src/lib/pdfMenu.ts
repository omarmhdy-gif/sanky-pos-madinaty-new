export type PdfMenuCategory = {
  name: { en: string; ar: string };
  color: string;
  items: Array<{ name: { en: string; ar: string }; price: number }>;
};

// Prices and English names are transcribed from the four-page menu PDF.
// Arabic names are UI translations; they do not alter the printed English names.
export const PDF_MENU: PdfMenuCategory[] = [
  {
    name: { en: "Sweet Treats", ar: "حلويات" }, color: "pink",
    items: [
      { name: { en: "Tiramisu", ar: "تيراميسو" }, price: 75 },
      { name: { en: "Cookies", ar: "كوكيز" }, price: 70 },
    ],
  },
  {
    name: { en: "Cheesecake", ar: "تشيز كيك" }, color: "amber",
    items: [
      { name: { en: "Plain", ar: "سادة" }, price: 75 },
      { name: { en: "Blueberry", ar: "توت أزرق" }, price: 85 },
      { name: { en: "Chocolate", ar: "شوكولاتة" }, price: 85 },
      { name: { en: "Pistachio", ar: "فستق" }, price: 120 },
    ],
  },
  {
    name: { en: "Bakery", ar: "مخبوزات" }, color: "espresso",
    items: [
      { name: { en: "Plain Croissant", ar: "كرواسون سادة" }, price: 70 },
      { name: { en: "Cheese & Zaatar Croissant", ar: "كرواسون جبنة وزعتر" }, price: 90 },
    ],
  },
  {
    name: { en: "Sanky Pops", ar: "سانكي بوبس" }, color: "violet",
    items: [
      { name: { en: "Chocolate", ar: "شوكولاتة" }, price: 85 },
      { name: { en: "White chocolate", ar: "شوكولاتة بيضاء" }, price: 85 },
      { name: { en: "Pistachio", ar: "فستق" }, price: 120 },
      { name: { en: "Lotus", ar: "لوتس" }, price: 90 },
      { name: { en: "Mix", ar: "ميكس" }, price: 110 },
    ],
  },
  {
    name: { en: "Bundles", ar: "عروض كومبو" }, color: "amber",
    items: [
      { name: { en: "Morning Bundle (Croissont plain + Cappucino/Latte)", ar: "عرض الصباح (كرواسون سادة + كابتشينو أو لاتيه)" }, price: 160 },
      { name: { en: "Specialty Bundle (Coffee + Pops Mix)", ar: "العرض المميز (قهوة + سانكي بوبس ميكس)" }, price: 185 },
      { name: { en: "Healthy Bundle (Protein Latte + Snack)", ar: "العرض الصحي (لاتيه بروتين + سناك)" }, price: 199 },
    ],
  },
  {
    name: { en: "Specialty Brews", ar: "قهوة مختصة" }, color: "espresso",
    items: [
      { name: { en: "V60 Single Origin", ar: "في 60 محصول واحد" }, price: 120 },
      { name: { en: "Hazelnut Coffee", ar: "قهوة بالبندق" }, price: 120 },
    ],
  },
  {
    name: { en: "Non Coffee", ar: "مشروبات بدون قهوة" }, color: "sky",
    items: [
      { name: { en: "Hot chocolate", ar: "شوكولاتة ساخنة" }, price: 85 },
      { name: { en: "Iced chocolate", ar: "شوكولاتة مثلجة" }, price: 85 },
      { name: { en: "Iced tea", ar: "شاي مثلج" }, price: 80 },
      { name: { en: "Pink lemonade", ar: "ليمونادة وردية" }, price: 105 },
      { name: { en: "Blue passion", ar: "بلو باشن" }, price: 110 },
      { name: { en: "Blueberry shake", ar: "ميلك شيك توت أزرق" }, price: 110 },
      { name: { en: "Redbull", ar: "ريد بول" }, price: 95 },
      { name: { en: "Mineral water", ar: "مياه معدنية" }, price: 15 },
    ],
  },
  {
    name: { en: "Espresso Based", ar: "مشروبات الإسبريسو" }, color: "espresso",
    items: [
      { name: { en: "Espresso", ar: "إسبريسو" }, price: 60 },
      { name: { en: "Americano", ar: "أمريكانو" }, price: 75 },
      { name: { en: "Latte", ar: "لاتيه" }, price: 95 },
      { name: { en: "Cappuccino", ar: "كابتشينو" }, price: 95 },
      { name: { en: "Flat white", ar: "فلات وايت" }, price: 85 },
      { name: { en: "Cortado", ar: "كورتادو" }, price: 80 },
      { name: { en: "Macchiato", ar: "ماكياتو" }, price: 70 },
      { name: { en: "Spanish latte", ar: "سبانيش لاتيه" }, price: 115 },
      { name: { en: "White Mocha", ar: "وايت موكا" }, price: 115 },
      { name: { en: "Caramel/Vanilla", ar: "كراميل أو فانيليا" }, price: 115 },
      { name: { en: "Caramel macchiato", ar: "كراميل ماكياتو" }, price: 120 },
      { name: { en: "Pistachio", ar: "فستق" }, price: 140 },
      { name: { en: "Salted caramel", ar: "كراميل مملح" }, price: 120 },
    ],
  },
  {
    name: { en: "Iced Coffee", ar: "قهوة مثلجة" }, color: "sky",
    items: [
      { name: { en: "Latte", ar: "لاتيه" }, price: 95 },
      { name: { en: "Spanish latte", ar: "سبانيش لاتيه" }, price: 115 },
      { name: { en: "White Mocha", ar: "وايت موكا" }, price: 115 },
      { name: { en: "Mocha", ar: "موكا" }, price: 115 },
      { name: { en: "Dulce de leche", ar: "دولسي دي ليتشي" }, price: 120 },
      { name: { en: "Pistachio", ar: "فستق" }, price: 130 },
      { name: { en: "Salted caramel", ar: "كراميل مملح" }, price: 120 },
      { name: { en: "Caramel macchiato", ar: "كراميل ماكياتو" }, price: 120 },
    ],
  },
  {
    name: { en: "Mojito", ar: "موهيتو" }, color: "emerald",
    items: [
      { name: { en: "Blueberry", ar: "توت أزرق" }, price: 85 },
      { name: { en: "Passion fruit", ar: "باشن فروت" }, price: 90 },
      { name: { en: "Kiwi", ar: "كيوي" }, price: 90 },
      { name: { en: "Cherry", ar: "كرز" }, price: 85 },
      { name: { en: "Blue curacao", ar: "بلو كوراساو" }, price: 85 },
      { name: { en: "Mojito redbull", ar: "موهيتو ريد بول" }, price: 150 },
    ],
  },
  {
    name: { en: "Boba", ar: "بوبا" }, color: "violet",
    items: [{ name: { en: "Boba", ar: "بوبا" }, price: 140 }],
  },
  {
    name: { en: "Matcha", ar: "ماتشا" }, color: "emerald",
    items: [
      { name: { en: "Honey Matcha", ar: "ماتشا بالعسل" }, price: 140 },
      { name: { en: "Coconut Matcha", ar: "ماتشا بجوز الهند" }, price: 145 },
      { name: { en: "Blended Matcha", ar: "ماتشا مخفوقة" }, price: 145 },
      { name: { en: "Banana Bread Matcha", ar: "ماتشا بنكهة خبز الموز" }, price: 150 },
    ],
  },
];

export const PDF_MENU_ITEM_COUNT = PDF_MENU.reduce((count, category) => count + category.items.length, 0);
