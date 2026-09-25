-- ============================================================================
-- Sanky POS — demo seed (branches, staff, inventory, catalog)
-- Run this once, after schema.sql, in the Supabase SQL Editor.
-- Redefines seed_catalog(p_branch_id) with the real data (schema.sql only
-- declares a placeholder), then seeds both branches.
-- Also what "Reset Demo Data" in Settings calls via reset_demo_data().
--
-- Demo PINs:
--   Sanky Coffee — Ahmed Sanky (owner) 1111, Laila Hassan (owner) 2222,
--                  Youssef Adel (cashier) 3333, Mona Tarek (cashier) 4444
--   Sanky GMC    — Omar Khaled (owner) 5555,
--                  Sara Ali (cashier) 6666, Khaled Nabil (cashier) 7777
--
-- Catalog (categories + products) is the real Sanky Coffee menu, defined in
-- import_real_menu(p_branch_id) below and invoked from seed_catalog() — same
-- function used by supabase/import_real_menu.sql for a one-off refresh
-- against an already-running database. Every product's recipe starts empty
-- (no ingredient cost data was supplied for this menu) — selling works fine
-- without one, same as any product with no recipe; wire up ingredients later
-- via Products/Recipes once you have real per-drink quantities.
-- ============================================================================

create or replace function import_real_menu(p_branch_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := p_branch_id; -- short alias used as an id prefix below
begin
  delete from products where branch_id = p_branch_id;
  delete from categories where branch_id = p_branch_id;

  insert into categories (id, branch_id, name, color, icon, sort_order) values
    (v || '_cat_croissant',   p_branch_id, '{"en":"Croissant","ar":"كرواسون"}'::jsonb,        'amber',    'Croissant', 0),
    (v || '_cat_dessert',     p_branch_id, '{"en":"Dessert","ar":"حلويات"}'::jsonb,            'pink',     'CakeSlice', 1),
    (v || '_cat_extras',      p_branch_id, '{"en":"Extras","ar":"إضافات"}'::jsonb,             'violet',   'Plus', 2),
    (v || '_cat_filter',      p_branch_id, '{"en":"Filter","ar":"قهوة مفلترة"}'::jsonb,        'espresso', 'Coffee', 3),
    (v || '_cat_frappe',      p_branch_id, '{"en":"Frappe","ar":"فرابيه"}'::jsonb,             'sky',      'CupSoda', 4),
    (v || '_cat_hotcoffee',   p_branch_id, '{"en":"Hot Coffee","ar":"قهوة ساخنة"}'::jsonb,     'espresso', 'Coffee', 5),
    (v || '_cat_icedcoffee',  p_branch_id, '{"en":"Iced Coffee","ar":"قهوة مثلجة"}'::jsonb,    'sky',      'CupSoda', 6),
    (v || '_cat_noncoffee',   p_branch_id, '{"en":"NON - Coffee","ar":"مشروبات بدون قهوة"}'::jsonb, 'emerald', 'Sandwich', 7),
    (v || '_cat_offers',      p_branch_id, '{"en":"Offers","ar":"عروض"}'::jsonb,               'violet',   'Gift', 8),
    (v || '_cat_sankypops',   p_branch_id, '{"en":"Sanky POPS","ar":"سانكي بوبس"}'::jsonb,     'pink',     'CakeSlice', 9);

  -- Croissant (3)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_croissant_chocolate', p_branch_id, '{"en":"Croissant Chocolate","ar":"كرواسون شوكولاتة"}'::jsonb, v||'_cat_croissant', 80.00, '🥐', true, '[]', '{}', 0),
    (v||'_p_croissant_plain',     p_branch_id, '{"en":"Croissant Plain","ar":"كرواسون سادة"}'::jsonb,        v||'_cat_croissant', 65.00, '🥐', true, '[]', '{}', 1),
    (v||'_p_croissant_pistachio', p_branch_id, '{"en":"Croissant Pistachio","ar":"كرواسون فستق"}'::jsonb,    v||'_cat_croissant', 100.00, '🥐', true, '[]', '{}', 2);

  -- Dessert (7)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_cheesecake_plain',      p_branch_id, '{"en":"Cheesecake Plain","ar":"تشيز كيك سادة"}'::jsonb,          v||'_cat_dessert', 75.00, '🍰', true, '[]', '{}', 0),
    (v||'_p_cookies',               p_branch_id, '{"en":"Cookies","ar":"كوكيز"}'::jsonb,                          v||'_cat_dessert', 60.00, '🍪', true, '[]', '{}', 1),
    (v||'_p_cheesecake_pistachio',  p_branch_id, '{"en":"Pistachio Cheesecake","ar":"تشيز كيك فستق"}'::jsonb,      v||'_cat_dessert', 120.00, '🍰', true, '[]', '{}', 2),
    (v||'_p_tiramisu',              p_branch_id, '{"en":"Tiramisu","ar":"تيراميسو"}'::jsonb,                      v||'_cat_dessert', 75.00, '🍮', true, '[]', '{}', 3),
    (v||'_p_cheesecake_blueberry',  p_branch_id, '{"en":"Blueberry Cheesecake","ar":"تشيز كيك التوت الأزرق"}'::jsonb, v||'_cat_dessert', 85.00, '🍰', true, '[]', '{}', 4),
    (v||'_p_cheesecake_chocolate',  p_branch_id, '{"en":"Chocolate Cheesecake","ar":"تشيز كيك شوكولاتة"}'::jsonb,  v||'_cat_dessert', 85.00, '🍰', true, '[]', '{}', 5),
    (v||'_p_cheesecake_lotus',      p_branch_id, '{"en":"Lotus Cheesecake","ar":"تشيز كيك لوتس"}'::jsonb,          v||'_cat_dessert', 90.00, '🍰', true, '[]', '{}', 6);

  -- Extras (4)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_extra_boba',    p_branch_id, '{"en":"Boba","ar":"بوبا"}'::jsonb,           v||'_cat_extras', 30.00, '➕', true, '[]', '{}', 0),
    (v||'_p_extra_flavour', p_branch_id, '{"en":"Flavour","ar":"إضافة نكهة"}'::jsonb,  v||'_cat_extras', 30.00, '➕', true, '[]', '{}', 1),
    (v||'_p_extra_milk',    p_branch_id, '{"en":"Milk","ar":"إضافة حليب"}'::jsonb,     v||'_cat_extras', 45.00, '➕', true, '[]', '{}', 2),
    (v||'_p_extra_shot',    p_branch_id, '{"en":"Shot","ar":"إضافة شوت"}'::jsonb,      v||'_cat_extras', 35.00, '➕', true, '[]', '{}', 3);

  -- Filter (6)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_filter_aeropress_ethiopia', p_branch_id, '{"en":"Aeropress - Ethiopia / Yirgacheffe","ar":"إيروبريس - إثيوبيا / يرغاتشيف"}'::jsonb, v||'_cat_filter', 110.00, '☕', true, '[]', '{}', 0),
    (v||'_p_filter_aeropress_costarica',p_branch_id, '{"en":"Aeropress - Costa Rica / Hacienda","ar":"إيروبريس - كوستاريكا / هاسيندا"}'::jsonb, v||'_cat_filter', 110.00, '☕', true, '[]', '{}', 1),
    (v||'_p_filter_icedv60',            p_branch_id, '{"en":"Iced V60","ar":"في60 مثلج"}'::jsonb,                                             v||'_cat_filter', 120.00, '🧊', true, '[]', '{}', 2),
    (v||'_p_filter_v60',                p_branch_id, '{"en":"V60","ar":"في60"}'::jsonb,                                                       v||'_cat_filter', 100.00, '☕', true, '[]', '{}', 3),
    (v||'_p_filter_v60_ethiopia',       p_branch_id, '{"en":"V60 - Ethiopia / Yirgacheffe","ar":"في60 - إثيوبيا / يرغاتشيف"}'::jsonb,           v||'_cat_filter', 120.00, '☕', true, '[]', '{}', 4),
    (v||'_p_filter_v60_costarica',      p_branch_id, '{"en":"V60 - Costa Rica / Hacienda","ar":"في60 - كوستاريكا / هاسيندا"}'::jsonb,           v||'_cat_filter', 120.00, '☕', true, '[]', '{}', 5);

  -- Frappe (15)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_frappe_caramel',          p_branch_id, '{"en":"Caramel Frappe","ar":"فرابيه كراميل"}'::jsonb,               v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 0),
    (v||'_p_frappe_caramelmacchiato', p_branch_id, '{"en":"Caramel Macchiato Frappe","ar":"فرابيه كراميل ماكياتو"}'::jsonb, v||'_cat_frappe', 120.00, '🥤', true, '[]', '{}', 1),
    (v||'_p_frappe_cinnamonvanilla',  p_branch_id, '{"en":"Cinnamon Vanilla Frappe","ar":"فرابيه قرفة وفانيليا"}'::jsonb, v||'_cat_frappe', 120.00, '🥤', true, '[]', '{}', 2),
    (v||'_p_frappe_classic',          p_branch_id, '{"en":"Classic Frappe","ar":"فرابيه كلاسيك"}'::jsonb,               v||'_cat_frappe', 90.00, '🥤', true, '[]', '{}', 3),
    (v||'_p_frappe_dulcedeleche',     p_branch_id, '{"en":"Dulce De Leche Frappe","ar":"فرابيه دولسي دي ليتشي"}'::jsonb, v||'_cat_frappe', 120.00, '🥤', true, '[]', '{}', 4),
    (v||'_p_frappe_hazelnut',         p_branch_id, '{"en":"Hazelnut Frappe","ar":"فرابيه بندق"}'::jsonb,                v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 5),
    (v||'_p_frappe_irish',            p_branch_id, '{"en":"Irish Frappe","ar":"فرابيه إيرش"}'::jsonb,                   v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 6),
    (v||'_p_frappe_lavender',         p_branch_id, '{"en":"Lavender Frappe","ar":"فرابيه لافندر"}'::jsonb,             v||'_cat_frappe', 120.00, '🥤', true, '[]', '{}', 7),
    (v||'_p_frappe_mocha',            p_branch_id, '{"en":"Mocha Frappe","ar":"فرابيه موكا"}'::jsonb,                   v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 8),
    (v||'_p_frappe_pistachio',        p_branch_id, '{"en":"Pistachio Frappe","ar":"فرابيه فستق"}'::jsonb,              v||'_cat_frappe', 130.00, '🥤', true, '[]', '{}', 9),
    (v||'_p_frappe_saltedcaramel',    p_branch_id, '{"en":"Salted Caramel Frappe","ar":"فرابيه كراميل مملح"}'::jsonb,   v||'_cat_frappe', 120.00, '🥤', true, '[]', '{}', 10),
    (v||'_p_frappe_spanish',          p_branch_id, '{"en":"Spanish Frappe","ar":"فرابيه إسباني"}'::jsonb,               v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 11),
    (v||'_p_frappe_toffeenut',        p_branch_id, '{"en":"Toffee-Nut Frappe","ar":"فرابيه توفي ونट"}'::jsonb,          v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 12),
    (v||'_p_frappe_vanilla',          p_branch_id, '{"en":"Vanilla Frappe","ar":"فرابيه فانيليا"}'::jsonb,              v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 13),
    (v||'_p_frappe_whitemocha',       p_branch_id, '{"en":"White Mocha Frappe","ar":"فرابيه وايت موكا"}'::jsonb,        v||'_cat_frappe', 115.00, '🥤', true, '[]', '{}', 14);

  -- Hot Coffee (25)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_hot_americano',            p_branch_id, '{"en":"Americano","ar":"أمريكانو"}'::jsonb,                     v||'_cat_hotcoffee', 75.00, '☕', true, '[]', '{}', 0),
    (v||'_p_hot_bombon',               p_branch_id, '{"en":"Bombon","ar":"بومبون"}'::jsonb,                          v||'_cat_hotcoffee', 75.00, '☕', true, '[]', '{}', 1),
    (v||'_p_hot_cappuccino',           p_branch_id, '{"en":"Cappuccino","ar":"كابتشينو"}'::jsonb,                    v||'_cat_hotcoffee', 85.00, '☕', true, '[]', '{}', 2),
    (v||'_p_hot_caramelmacchiato',     p_branch_id, '{"en":"Caramel Macchiato","ar":"كراميل ماكياتو"}'::jsonb,       v||'_cat_hotcoffee', 120.00, '☕', true, '[]', '{}', 3),
    (v||'_p_hot_caramellatte',         p_branch_id, '{"en":"Caramel Latte","ar":"لاتيه كراميل"}'::jsonb,             v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 4),
    (v||'_p_hot_coconutlatte',         p_branch_id, '{"en":"Coconut Latte","ar":"لاتيه جوز الهند"}'::jsonb,          v||'_cat_hotcoffee', 120.00, '☕', true, '[]', '{}', 5),
    (v||'_p_hot_cortado',              p_branch_id, '{"en":"Cortado","ar":"كورتادو"}'::jsonb,                        v||'_cat_hotcoffee', 75.00, '☕', true, '[]', '{}', 6),
    (v||'_p_hot_dulcedeleche',         p_branch_id, '{"en":"Dulce de Leche","ar":"دولسي دي ليتشي"}'::jsonb,          v||'_cat_hotcoffee', 120.00, '☕', true, '[]', '{}', 7),
    (v||'_p_hot_espresso',             p_branch_id, '{"en":"Espresso","ar":"إسبريسو"}'::jsonb,                       v||'_cat_hotcoffee', 60.00, '☕', true, '[]', '{}', 8),
    (v||'_p_hot_flatwhite',            p_branch_id, '{"en":"Flat White","ar":"فلات وايت"}'::jsonb,                   v||'_cat_hotcoffee', 80.00, '☕', true, '[]', '{}', 9),
    (v||'_p_hot_frenchcoffee',         p_branch_id, '{"en":"French Coffee","ar":"قهوة فرنساوي"}'::jsonb,             v||'_cat_hotcoffee', 65.00, '☕', true, '[]', '{}', 10),
    (v||'_p_hot_hazelnut',             p_branch_id, '{"en":"Hazelnut","ar":"بندق"}'::jsonb,                          v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 11),
    (v||'_p_hot_latte',                p_branch_id, '{"en":"Latte","ar":"لاتيه"}'::jsonb,                            v||'_cat_hotcoffee', 85.00, '☕', true, '[]', '{}', 12),
    (v||'_p_hot_machiato',             p_branch_id, '{"en":"Macchiato","ar":"ماكياتو"}'::jsonb,                      v||'_cat_hotcoffee', 70.00, '☕', true, '[]', '{}', 13),
    (v||'_p_hot_mocha',                p_branch_id, '{"en":"Mocha","ar":"موكا"}'::jsonb,                             v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 14),
    (v||'_p_hot_pistachiolatte',       p_branch_id, '{"en":"Pistachio Latte","ar":"لاتيه فستق"}'::jsonb,             v||'_cat_hotcoffee', 125.00, '☕', true, '[]', '{}', 15),
    (v||'_p_hot_saltedcaramel',        p_branch_id, '{"en":"Salted Caramel","ar":"كراميل مملح"}'::jsonb,             v||'_cat_hotcoffee', 120.00, '☕', true, '[]', '{}', 16),
    (v||'_p_hot_spanishlatte',         p_branch_id, '{"en":"Spanish Latte","ar":"لاتيه إسباني"}'::jsonb,             v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 17),
    (v||'_p_hot_spicedspanishlatte',   p_branch_id, '{"en":"Spiced Spanish Latte","ar":"لاتيه إسباني بالتوابل"}'::jsonb, v||'_cat_hotcoffee', 125.00, '☕', true, '[]', '{}', 18),
    (v||'_p_hot_toffeenut',            p_branch_id, '{"en":"Toffee Nut","ar":"توفي ونط"}'::jsonb,                    v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 19),
    (v||'_p_hot_turkishd',             p_branch_id, '{"en":"Turkish Coffee (Sweet)","ar":"قهوة تركية سادة زيادة"}'::jsonb, v||'_cat_hotcoffee', 50.00, '☕', true, '[]', '{}', 20),
    (v||'_p_hot_turkishs',             p_branch_id, '{"en":"Turkish Coffee (Plain)","ar":"قهوة تركية سادة"}'::jsonb, v||'_cat_hotcoffee', 35.00, '☕', true, '[]', '{}', 21),
    (v||'_p_hot_vanillalatte',         p_branch_id, '{"en":"Vanilla Latte","ar":"لاتيه فانيليا"}'::jsonb,            v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 22),
    (v||'_p_hot_whitemocha',           p_branch_id, '{"en":"White Mocha","ar":"وايت موكا"}'::jsonb,                  v||'_cat_hotcoffee', 115.00, '☕', true, '[]', '{}', 23),
    (v||'_p_hot_whitemochapistachio',  p_branch_id, '{"en":"White Mocha Pistachio","ar":"وايت موكا فستق"}'::jsonb,   v||'_cat_hotcoffee', 125.00, '☕', true, '[]', '{}', 24);

  -- Iced Coffee (17)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_iced_dulcedeleche',       p_branch_id, '{"en":"Dulce de Leche (Iced)","ar":"دولسي دي ليتشي مثلج"}'::jsonb, v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 0),
    (v||'_p_iced_americano',          p_branch_id, '{"en":"Iced Americano","ar":"أمريكانو مثلج"}'::jsonb,              v||'_cat_icedcoffee', 75.00, '🧊', true, '[]', '{}', 1),
    (v||'_p_iced_caramelmacchiato',   p_branch_id, '{"en":"Iced Caramel Macchiato","ar":"كراميل ماكياتو مثلج"}'::jsonb, v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 2),
    (v||'_p_iced_caramellatte',       p_branch_id, '{"en":"Iced Caramel Latte","ar":"لاتيه كراميل مثلج"}'::jsonb,      v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 3),
    (v||'_p_iced_cinnamonvanilla',    p_branch_id, '{"en":"Iced Cinnamon Vanilla","ar":"قرفة وفانيليا مثلج"}'::jsonb,  v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 4),
    (v||'_p_iced_iceddulcedeleche',   p_branch_id, '{"en":"Iced Dulce de Leche","ar":"دولسي دي ليتشي مثلج (2)"}'::jsonb, v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 5),
    (v||'_p_iced_hazelnut',           p_branch_id, '{"en":"Iced Hazelnut","ar":"بندق مثلج"}'::jsonb,                   v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 6),
    (v||'_p_iced_irishlatte',         p_branch_id, '{"en":"Iced Irish Latte","ar":"لاتيه إيرش مثلج"}'::jsonb,          v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 7),
    (v||'_p_iced_latte',              p_branch_id, '{"en":"Iced Latte","ar":"لاتيه مثلج"}'::jsonb,                    v||'_cat_icedcoffee', 85.00, '🧊', true, '[]', '{}', 8),
    (v||'_p_iced_lavenderlatte',      p_branch_id, '{"en":"Iced Lavender Latte","ar":"لاتيه لافندر مثلج"}'::jsonb,    v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 9),
    (v||'_p_iced_mocha',              p_branch_id, '{"en":"Iced Mocha","ar":"موكا مثلج"}'::jsonb,                     v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 10),
    (v||'_p_iced_pistachiolatte',     p_branch_id, '{"en":"Iced Pistachio Latte","ar":"لاتيه فستق مثلج"}'::jsonb,     v||'_cat_icedcoffee', 125.00, '🧊', true, '[]', '{}', 11),
    (v||'_p_iced_saltedcaramel',      p_branch_id, '{"en":"Iced Salted Caramel","ar":"كراميل مملح مثلج"}'::jsonb,     v||'_cat_icedcoffee', 120.00, '🧊', true, '[]', '{}', 12),
    (v||'_p_iced_spanishlatte',       p_branch_id, '{"en":"Iced Spanish Latte","ar":"لاتيه إسباني مثلج"}'::jsonb,     v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 13),
    (v||'_p_iced_toffeenut',          p_branch_id, '{"en":"Iced Toffee-Nut","ar":"توفي ونت مثلج"}'::jsonb,            v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 14),
    (v||'_p_iced_vanillalatte',       p_branch_id, '{"en":"Iced Vanilla Latte","ar":"لاتيه فانيليا مثلج"}'::jsonb,    v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 15),
    (v||'_p_iced_whitemocha',         p_branch_id, '{"en":"Iced White Mocha","ar":"وايت موكا مثلج"}'::jsonb,          v||'_cat_icedcoffee', 115.00, '🧊', true, '[]', '{}', 16);

  -- NON - Coffee (16)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_non_bluepassion',        p_branch_id, '{"en":"Blue Passion","ar":"بلو باشن"}'::jsonb,                 v||'_cat_noncoffee', 110.00, '🍹', true, '[]', '{}', 0),
    (v||'_p_non_bluecuracaomojito',  p_branch_id, '{"en":"Blue Curacao Mojito","ar":"موهيتو بلو كوراساو"}'::jsonb, v||'_cat_noncoffee', 85.00, '🍹', true, '[]', '{}', 1),
    (v||'_p_non_blueberrymojito',    p_branch_id, '{"en":"Blueberry Mojito","ar":"موهيتو توت أزرق"}'::jsonb,      v||'_cat_noncoffee', 85.00, '🍹', true, '[]', '{}', 2),
    (v||'_p_non_blueberryshake',     p_branch_id, '{"en":"Blueberry Shake","ar":"شيك توت أزرق"}'::jsonb,          v||'_cat_noncoffee', 110.00, '🍹', true, '[]', '{}', 3),
    (v||'_p_non_cherrymojito',       p_branch_id, '{"en":"Cherry Mojito","ar":"موهيتو كرز"}'::jsonb,              v||'_cat_noncoffee', 85.00, '🍹', true, '[]', '{}', 4),
    (v||'_p_non_hotchocobar',        p_branch_id, '{"en":"Hot Choco Bar","ar":"هوت شوكو بار"}'::jsonb,            v||'_cat_noncoffee', 100.00, '🍫', true, '[]', '{}', 5),
    (v||'_p_non_hotchocolate',       p_branch_id, '{"en":"Hot Chocolate","ar":"شوكولاتة ساخنة"}'::jsonb,          v||'_cat_noncoffee', 85.00, '🍫', true, '[]', '{}', 6),
    (v||'_p_non_icechocolate',       p_branch_id, '{"en":"Iced Chocolate","ar":"شوكولاتة مثلجة"}'::jsonb,         v||'_cat_noncoffee', 85.00, '🍫', true, '[]', '{}', 7),
    (v||'_p_non_icetea',             p_branch_id, '{"en":"Ice Tea","ar":"آيس تي"}'::jsonb,                        v||'_cat_noncoffee', 80.00, '🧋', true, '[]', '{}', 8),
    (v||'_p_non_iceteamojito',       p_branch_id, '{"en":"Ice Tea Mojito","ar":"موهيتو آيس تي"}'::jsonb,          v||'_cat_noncoffee', 85.00, '🧋', true, '[]', '{}', 9),
    (v||'_p_non_mineralwater',       p_branch_id, '{"en":"Mineral Water","ar":"مياه معدنية"}'::jsonb,             v||'_cat_noncoffee', 10.00, '💧', true, '[]', '{}', 10),
    (v||'_p_non_mojitoredbull',      p_branch_id, '{"en":"Mojito Redbull","ar":"موهيتو ريد بُل"}'::jsonb,         v||'_cat_noncoffee', 130.00, '🍹', true, '[]', '{}', 11),
    (v||'_p_non_passionfruitmojito', p_branch_id, '{"en":"Passion Fruit Mojito","ar":"موهيتو فاكهة العشق"}'::jsonb, v||'_cat_noncoffee', 90.00, '🍹', true, '[]', '{}', 12),
    (v||'_p_non_pinklemonade',       p_branch_id, '{"en":"Pink Lemonade","ar":"ليموناضة وردية"}'::jsonb,          v||'_cat_noncoffee', 100.00, '🍋', true, '[]', '{}', 13),
    (v||'_p_non_redbull',            p_branch_id, '{"en":"Red Bull","ar":"ريد بُل"}'::jsonb,                      v||'_cat_noncoffee', 80.00, '🥤', true, '[]', '{}', 14),
    (v||'_p_non_kiwimojito',         p_branch_id, '{"en":"Kiwi Mojito","ar":"موهيتو كيوي"}'::jsonb,               v||'_cat_noncoffee', 90.00, '🍹', true, '[]', '{}', 15);

  -- Offers (2)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_offer_breakfast',        p_branch_id, '{"en":"Breakfast Offer","ar":"عرض الإفطار"}'::jsonb,           v||'_cat_offers', 175.00, '🎁', true, '[]', '{}', 0),
    (v||'_p_offer_specialtybundle',  p_branch_id, '{"en":"Specialty Bundle","ar":"باقة سبيشيالتي"}'::jsonb,       v||'_cat_offers', 175.00, '🎁', true, '[]', '{}', 1);

  -- Sanky POPS (6)
  insert into products (id, branch_id, name, category_id, price, image, is_active, recipe, modifier_group_ids, sort_order) values
    (v||'_p_pops_coffee',           p_branch_id, '{"en":"Sanky Pops Coffee","ar":"سانكي بوبس قهوة"}'::jsonb,            v||'_cat_sankypops', 65.00, '🍭', true, '[]', '{}', 0),
    (v||'_p_pops_mix',              p_branch_id, '{"en":"Sanky Pops Mix","ar":"سانكي بوبس مكس"}'::jsonb,                v||'_cat_sankypops', 110.00, '🍭', true, '[]', '{}', 1),
    (v||'_p_pops_chocolate',        p_branch_id, '{"en":"Sanky Pops Chocolate","ar":"سانكي بوبس شوكولاتة"}'::jsonb,     v||'_cat_sankypops', 85.00, '🍭', true, '[]', '{}', 2),
    (v||'_p_pops_lotus',            p_branch_id, '{"en":"Sanky Pops Lotus","ar":"سانكي بوبس لوتس"}'::jsonb,             v||'_cat_sankypops', 90.00, '🍭', true, '[]', '{}', 3),
    (v||'_p_pops_pistachio',        p_branch_id, '{"en":"Sanky Pops Pistachio","ar":"سانكي بوبس فستق"}'::jsonb,         v||'_cat_sankypops', 120.00, '🍭', true, '[]', '{}', 4),
    (v||'_p_pops_whitechocolate',   p_branch_id, '{"en":"Sanky Pops White Chocolate","ar":"سانكي بوبس شوكولاتة بيضاء"}'::jsonb, v||'_cat_sankypops', 85.00, '🍭', true, '[]', '{}', 5);

end;
$$;

create or replace function seed_catalog(p_branch_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin

if p_branch_id = 'branch_coffee' then

  insert into branches (id, name) values
    ('branch_coffee', '{"en":"Sanky Coffee","ar":"سانكي كوفي"}'::jsonb)
  on conflict (id) do update set name = excluded.name;

  insert into shop_settings (branch_id, shop_name, currency, currency_symbol, tax_rate, tax_enabled, locale, theme, receipt_footer, address, phone)
  values (
    'branch_coffee', 'Sanky Coffee House', 'EGP', 'EGP', 14, true, 'en', 'light',
    '{"en":"Thank you for visiting Sanky Coffee House!","ar":"شكراً لزيارتكم سانكي كوفي هاوس!"}'::jsonb,
    '12 Nile Corniche St, Cairo', '+20 100 123 4567'
  )
  on conflict (branch_id) do update set
    shop_name = excluded.shop_name, currency = excluded.currency, currency_symbol = excluded.currency_symbol,
    tax_rate = excluded.tax_rate, tax_enabled = excluded.tax_enabled, locale = excluded.locale, theme = excluded.theme,
    receipt_footer = excluded.receipt_footer, address = excluded.address, phone = excluded.phone;

  insert into staff (id, name, pin_hash, role, avatar_color, is_active, branch_id) values
    ('cf_u_owner', 'Ahmed Sanky', crypt('1111', gen_salt('bf')), 'owner', 'bg-espresso-600', true, 'branch_coffee'),
    ('cf_u_owner2', 'Laila Hassan', crypt('2222', gen_salt('bf')), 'owner', 'bg-amber-600', true, 'branch_coffee'),
    ('cf_u_cashier1', 'Youssef Adel', crypt('3333', gen_salt('bf')), 'cashier', 'bg-emerald-600', true, 'branch_coffee'),
    ('cf_u_cashier2', 'Mona Tarek', crypt('4444', gen_salt('bf')), 'cashier', 'bg-sky-600', true, 'branch_coffee')
  on conflict (id) do update set
    name = excluded.name, role = excluded.role, avatar_color = excluded.avatar_color, is_active = excluded.is_active;

  insert into modifier_groups (id, branch_id, name, required, multi_select, options, sort_order) values
    ('cf_mod_size', 'branch_coffee', '{"en":"Size","ar":"الحجم"}'::jsonb, true, false,
      '[{"id":"size_s","name":{"en":"Small","ar":"صغير"},"priceDelta":0},
        {"id":"size_m","name":{"en":"Medium","ar":"وسط"},"priceDelta":10},
        {"id":"size_l","name":{"en":"Large","ar":"كبير"},"priceDelta":18}]'::jsonb, 0),
    ('cf_mod_milk', 'branch_coffee', '{"en":"Milk","ar":"الحليب"}'::jsonb, false, false,
      '[{"id":"milk_whole","name":{"en":"Whole Milk","ar":"حليب كامل الدسم"},"priceDelta":0},
        {"id":"milk_oat","name":{"en":"Oat Milk","ar":"حليب الشوفان"},"priceDelta":12},
        {"id":"milk_almond","name":{"en":"Almond Milk","ar":"حليب اللوز"},"priceDelta":12},
        {"id":"milk_skim","name":{"en":"Skim Milk","ar":"حليب خالي الدسم"},"priceDelta":0}]'::jsonb, 1),
    ('cf_mod_extra', 'branch_coffee', '{"en":"Extras","ar":"إضافات"}'::jsonb, false, true,
      '[{"id":"extra_shot","name":{"en":"Extra Shot","ar":"شوت إضافي"},"priceDelta":8},
        {"id":"extra_vanilla","name":{"en":"Vanilla Syrup","ar":"شراب الفانيليا"},"priceDelta":6},
        {"id":"extra_caramel","name":{"en":"Caramel Syrup","ar":"شراب الكراميل"},"priceDelta":6},
        {"id":"extra_whip","name":{"en":"Whipped Cream","ar":"كريمة مخفوقة"},"priceDelta":6}]'::jsonb, 2)
  on conflict (id) do update set
    name = excluded.name, required = excluded.required, multi_select = excluded.multi_select,
    options = excluded.options, sort_order = excluded.sort_order;

  insert into inventory_items (id, branch_id, name, type, unit, quantity, critical_threshold, low_threshold) values
    ('cf_inv_espresso', 'branch_coffee', '{"en":"Espresso (ground coffee)","ar":"إسبريسو (بن مطحون)"}'::jsonb, 'measured', 'g', 5000, 500, 1500),
    ('cf_inv_milk', 'branch_coffee', '{"en":"Milk","ar":"حليب"}'::jsonb, 'measured', 'ml', 10000, 1000, 3000),
    ('cf_inv_choc_sauce', 'branch_coffee', '{"en":"Chocolate Sauce","ar":"صوص الشوكولاتة"}'::jsonb, 'measured', 'ml', 2000, 200, 500),
    ('cf_inv_cup', 'branch_coffee', '{"en":"Cups","ar":"أكواب"}'::jsonb, 'piece', null, 500, 50, 150)
  on conflict (id) do update set
    name = excluded.name, type = excluded.type, unit = excluded.unit, quantity = excluded.quantity,
    critical_threshold = excluded.critical_threshold, low_threshold = excluded.low_threshold;

  perform import_real_menu('branch_coffee');

elsif p_branch_id = 'branch_gmc' then

  insert into branches (id, name) values
    ('branch_gmc', '{"en":"Sanky GMC","ar":"سانكي جي إم سي"}'::jsonb)
  on conflict (id) do update set name = excluded.name;

  insert into shop_settings (branch_id, shop_name, currency, currency_symbol, tax_rate, tax_enabled, locale, theme, receipt_footer, address, phone)
  values (
    'branch_gmc', 'Sanky Coffee — GMC Branch', 'EGP', 'EGP', 14, true, 'en', 'light',
    '{"en":"Thank you for visiting Sanky Coffee — GMC!","ar":"شكراً لزيارتكم سانكي كوفي - جي إم سي!"}'::jsonb,
    '5th Settlement, GMC Plaza, Cairo', '+20 100 987 6543'
  )
  on conflict (branch_id) do update set
    shop_name = excluded.shop_name, currency = excluded.currency, currency_symbol = excluded.currency_symbol,
    tax_rate = excluded.tax_rate, tax_enabled = excluded.tax_enabled, locale = excluded.locale, theme = excluded.theme,
    receipt_footer = excluded.receipt_footer, address = excluded.address, phone = excluded.phone;

  insert into staff (id, name, pin_hash, role, avatar_color, is_active, branch_id) values
    ('gm_u_owner', 'Omar Khaled', crypt('5555', gen_salt('bf')), 'owner', 'bg-violet-600', true, 'branch_gmc'),
    ('gm_u_cashier1', 'Sara Ali', crypt('6666', gen_salt('bf')), 'cashier', 'bg-pink-600', true, 'branch_gmc'),
    ('gm_u_cashier2', 'Khaled Nabil', crypt('7777', gen_salt('bf')), 'cashier', 'bg-emerald-600', true, 'branch_gmc')
  on conflict (id) do update set
    name = excluded.name, role = excluded.role, avatar_color = excluded.avatar_color, is_active = excluded.is_active;

  insert into modifier_groups (id, branch_id, name, required, multi_select, options, sort_order) values
    ('gm_mod_size', 'branch_gmc', '{"en":"Size","ar":"الحجم"}'::jsonb, true, false,
      '[{"id":"size_s","name":{"en":"Small","ar":"صغير"},"priceDelta":0},
        {"id":"size_m","name":{"en":"Medium","ar":"وسط"},"priceDelta":10},
        {"id":"size_l","name":{"en":"Large","ar":"كبير"},"priceDelta":18}]'::jsonb, 0),
    ('gm_mod_milk', 'branch_gmc', '{"en":"Milk","ar":"الحليب"}'::jsonb, false, false,
      '[{"id":"milk_whole","name":{"en":"Whole Milk","ar":"حليب كامل الدسم"},"priceDelta":0},
        {"id":"milk_oat","name":{"en":"Oat Milk","ar":"حليب الشوفان"},"priceDelta":12},
        {"id":"milk_almond","name":{"en":"Almond Milk","ar":"حليب اللوز"},"priceDelta":12},
        {"id":"milk_skim","name":{"en":"Skim Milk","ar":"حليب خالي الدسم"},"priceDelta":0}]'::jsonb, 1),
    ('gm_mod_extra', 'branch_gmc', '{"en":"Extras","ar":"إضافات"}'::jsonb, false, true,
      '[{"id":"extra_shot","name":{"en":"Extra Shot","ar":"شوت إضافي"},"priceDelta":8},
        {"id":"extra_vanilla","name":{"en":"Vanilla Syrup","ar":"شراب الفانيليا"},"priceDelta":6},
        {"id":"extra_caramel","name":{"en":"Caramel Syrup","ar":"شراب الكراميل"},"priceDelta":6},
        {"id":"extra_whip","name":{"en":"Whipped Cream","ar":"كريمة مخفوقة"},"priceDelta":6}]'::jsonb, 2)
  on conflict (id) do update set
    name = excluded.name, required = excluded.required, multi_select = excluded.multi_select,
    options = excluded.options, sort_order = excluded.sort_order;

  insert into inventory_items (id, branch_id, name, type, unit, quantity, critical_threshold, low_threshold) values
    ('gm_inv_espresso', 'branch_gmc', '{"en":"Espresso (ground coffee)","ar":"إسبريسو (بن مطحون)"}'::jsonb, 'measured', 'g', 5000, 500, 1500),
    ('gm_inv_milk', 'branch_gmc', '{"en":"Milk","ar":"حليب"}'::jsonb, 'measured', 'ml', 10000, 1000, 3000),
    ('gm_inv_choc_sauce', 'branch_gmc', '{"en":"Chocolate Sauce","ar":"صوص الشوكولاتة"}'::jsonb, 'measured', 'ml', 2000, 200, 500),
    ('gm_inv_cup', 'branch_gmc', '{"en":"Cups","ar":"أكواب"}'::jsonb, 'piece', null, 500, 50, 150)
  on conflict (id) do update set
    name = excluded.name, type = excluded.type, unit = excluded.unit, quantity = excluded.quantity,
    critical_threshold = excluded.critical_threshold, low_threshold = excluded.low_threshold;

  perform import_real_menu('branch_gmc');

else
  raise exception 'Unknown branch_id: %', p_branch_id;
end if;

end;
$$;

select seed_catalog('branch_coffee');
select seed_catalog('branch_gmc');
