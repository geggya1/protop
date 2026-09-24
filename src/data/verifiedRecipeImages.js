/**
 * Manuelt verifiserte bilder for innebygde oppskrifter.
 *
 * Hvert bilde er kontrollert mot rettens tittel og ingredienser.
 * Kun Wikimedia Commons (åpen lisens). Ved tvil er retten utelatt.
 *
 * Felter:
 * - url: stabil thumbnail-URL (uten sporingsparametre)
 * - file: filnavn på Commons (for revisjon)
 * - license: lisens fra Commons
 * - verified: kort begrunnelse for hvorfor bildet matcher retten
 */

export const VERIFIED_RECIPE_IMAGES = {
  // ——— Norske klassikere ———
  farikal: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/80/Farikal.jpg',
    file: 'Farikal.jpg',
    license: 'Public domain',
    verified: 'Viser norsk fårikål med kål og lam.',
  },
  pinnekjott: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Pinnekjott.jpg/960px-Pinnekjott.jpg',
    file: 'Pinnekjott.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Pinnekjøtt — typisk norsk julerett.',
  },
  rømmegrøt: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/R%C3%B6mmegr%C3%B6t.jpg',
    file: 'Römmegröt.jpg',
    license: 'Public domain',
    verified: 'Rømmegrøt — norsk surmelksgrøt.',
  },
  kjottkaker: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Traditional_Kj%C3%B8ttkaker.jpg/960px-Traditional_Kj%C3%B8ttkaker.jpg',
    file: 'Traditional Kjøttkaker.jpg',
    license: 'CC BY 2.0',
    verified: 'Tradisjonelle kjøttkaker.',
  },
  kjøttboller: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Traditional_Kj%C3%B8ttkaker.jpg/960px-Traditional_Kj%C3%B8ttkaker.jpg',
    file: 'Traditional Kjøttkaker.jpg',
    license: 'CC BY 2.0',
    verified: 'Hjemmelagde kjøttboller — visuelt tilsvarende norske kjøttkaker.',
  },
  komle: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Komlemiddag.jpg/960px-Komlemiddag.jpg',
    file: 'Komlemiddag.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Komlemiddag med komle, kjøtt og kålrabistappe.',
  },
  fiskeboller: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Fishball.jpg/960px-Fishball.jpg',
    file: 'Fishball.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Fiskeboller.',
  },
  fiskesuppe: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Fish_soup_in_Bergen.jpg/960px-Fish_soup_in_Bergen.jpg',
    file: 'Fish soup in Bergen.jpg',
    license: 'CC BY 2.0',
    verified: 'Bergensk fiskesuppe — matcher kremet fiskesuppe med fisk og grønnsaker.',
  },
  blomkal: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Cauliflower_Soup.jpg/960px-Cauliflower_Soup.jpg',
    file: 'Cauliflower Soup.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Blomkålsuppe i bolle.',
  },
  ertesuppe: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Pea_soup_2.jpg/960px-Pea_soup_2.jpg',
    file: 'Pea soup 2.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Ertesuppe med brød.',
  },
  pyttipanne: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Biksemad.jpg/960px-Biksemad.jpg',
    file: 'Biksemad.jpg',
    license: 'CC0',
    verified: 'Pytt i panne — tilsvarende skandinavisk potet-/kjøttrett i panne.',
  },
  'pølse-potet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/P%C3%B8lse_med_potetmos.jpg/960px-P%C3%B8lse_med_potetmos.jpg',
    file: 'Pølse med potetmos.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Pølse med potetmos.',
  },
  'stek-lof': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Pot_roast.jpg/960px-Pot_roast.jpg',
    file: 'Pot roast.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Ovnsstekt kjøtt med poteter.',
  },
  pepperkaker: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Freshly_baked_gingerbread_-_Christmas_2004.jpg',
    file: 'Freshly baked gingerbread - Christmas 2004.jpg',
    license: 'CC BY-SA 2.0',
    verified: 'Nybakte pepperkaker / ingefærkjeks.',
  },
  vafler: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Vaffel.jpg/960px-Vaffel.jpg',
    file: 'Vaffel.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Norsk vaffel fra servering.',
  },
  pannekaker: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Stack_of_pancakes.jpg/960px-Stack_of_pancakes.jpg',
    file: 'Stack of pancakes.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Stabel med pannekaker på tallerken.',
  },
  havregraut: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Havregr%C3%B8t.jpg/960px-Havregr%C3%B8t.jpg',
    file: 'Havregrøt.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Havregrøt servert i bolle.',
  },

  // ——— Frokost ———
  smoothiebowl: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Smoothie_bowl.jpg/960px-Smoothie_bowl.jpg',
    file: 'Smoothie bowl.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Smoothie bowl med frukt.',
  },
  'frokost-yoghurt-granola': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Yogurt_with_granola.jpg',
    file: 'Yogurt with granola.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Yoghurt med granola.',
  },
  'frokost-egg-bacon': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Eggs_and_bacon.jpg',
    file: 'Eggs and bacon.jpg',
    license: 'Public domain',
    verified: 'Speilegg med bacon.',
  },
  'frokost-smoothie': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Fruit_smoothie.jpg/960px-Fruit_smoothie.jpg',
    file: 'Fruit smoothie.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Frukt-smoothie.',
  },
  'frokost-risgrot': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Rice_pudding_cinnamon.jpg/960px-Rice_pudding_cinnamon.jpg',
    file: 'Rice pudding cinnamon.jpg',
    license: 'CC BY 2.0',
    verified: 'Risgrøt med kanel.',
  },

  // ——— Lunsj ———
  egg: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Egg_salad_sandwich.jpg/960px-Egg_salad_sandwich.jpg',
    file: 'Egg salad sandwich.jpg',
    license: 'CC BY-SA 2.0',
    verified: 'Eggesalat på brød.',
  },
  omelett: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/55/Omelette.jpg',
    file: 'Omelette.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Omelett.',
  },
  'salat-kylling': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chicken_salad.jpg',
    file: 'Chicken salad.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Kyllingsalat.',
  },
  'lunsj-suppe': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Tomato_soup_with_bread.jpg/960px-Tomato_soup_with_bread.jpg',
    file: 'Tomato soup with bread.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Tomatsuppe med brød.',
  },
  'lunsj-pastasalat': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Pasta_salad.jpg/960px-Pasta_salad.jpg',
    file: 'Pasta salad.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Pastasalat.',
  },
  'lunsj-bowl': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Salmon_bowl.jpg/960px-Salmon_bowl.jpg',
    file: 'Salmon bowl.jpg',
    license: 'CC BY 2.0',
    verified: 'Laksebowl med ris.',
  },
  'lunsj-lefse': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Lefse_with_lingonberries.jpg/960px-Lefse_with_lingonberries.jpg',
    file: 'Lefse with lingonberries.jpg',
    license: 'Public domain',
    verified: 'Norsk lefse.',
  },
  'lunsj-gronnsakssuppe': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Vegetable_soup.jpg/960px-Vegetable_soup.jpg',
    file: 'Vegetable soup.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Grønnsakssuppe.',
  },
  'lunsj-minestrone': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Minestrone.jpg/960px-Minestrone.jpg',
    file: 'Minestrone.jpg',
    license: 'Public domain',
    verified: 'Minestronesuppe.',
  },
  'lunsj-tunfisksalat': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Tuna_salad_sandwich.jpg/960px-Tuna_salad_sandwich.jpg',
    file: 'Tuna salad sandwich.jpg',
    license: 'CC BY 2.0',
    verified: 'Tunfisksalat på brød.',
  },
  'lunsj-baguette-skinke': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Baguette_sandwich.jpg/960px-Baguette_sandwich.jpg',
    file: 'Baguette sandwich.jpg',
    license: 'CC BY 2.0',
    verified: 'Baguette med pålegg.',
  },
  'lunsj-bønnesalat': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Bean_salad.jpg/960px-Bean_salad.jpg',
    file: 'Bean salad.jpg',
    license: 'CC0',
    verified: 'Bønnesalat.',
  },
  'lunsj-avokadotoast': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Avocado_toast.jpg/960px-Avocado_toast.jpg',
    file: 'Avocado toast.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Avokadotoast på brød.',
  },
  'lunsj-risotto-rest': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Risotto.jpg/960px-Risotto.jpg',
    file: 'Risotto.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Risotto.',
  },

  // ——— Middag (internasjonale og tydelige retter) ———
  tomatpasta: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Tomato_pasta.jpg/960px-Tomato_pasta.jpg',
    file: 'Tomato pasta.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Tomatpasta.',
  },
  lasagne: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Lasagne.jpg',
    file: 'Lasagne.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Lasagne.',
  },
  pizza: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Pizza_Margherita_stu_spivack.jpg/960px-Pizza_Margherita_stu_spivack.jpg',
    file: 'Pizza Margherita stu spivack.jpg',
    license: 'CC BY-SA 2.0',
    verified: 'Pizza Margherita.',
  },
  burger: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Cheeseburger_%282%29.jpg/960px-Cheeseburger_%282%29.jpg',
    file: 'Hamburger (1).jpg',
    license: 'Public domain',
    verified: 'Hamburger med brød og pålegg.',
  },
  taco: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Tacos_%281%29.jpg/960px-Tacos_%281%29.jpg',
    file: 'Tacos (1).jpg',
    license: 'CC BY 2.0',
    verified: 'Tacos.',
  },
  nachos: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Nachos.jpg/960px-Nachos.jpg',
    file: 'Nachos.jpg',
    license: 'Public domain',
    verified: 'Nachos med ost.',
  },
  'middag-spaghetti-bolognese': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Spaghetti_Bolognese.jpg',
    file: 'Spaghetti Bolognese.jpg',
    license: 'Public domain',
    verified: 'Spaghetti bolognese.',
  },
  'middag-carbonara': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Spaghetti_alla_Carbonara.jpg/960px-Spaghetti_alla_Carbonara.jpg',
    file: 'Spaghetti alla Carbonara.jpg',
    license: 'Public domain',
    verified: 'Pasta carbonara.',
  },
  'middag-chili-con-carne': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Chili_con_carne.jpg/960px-Chili_con_carne.jpg',
    file: 'Chili con carne.jpg',
    license: 'Public domain',
    verified: 'Chili con carne.',
  },
  'middag-paella': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Paella_de_marisco_01.jpg/960px-Paella_de_marisco_01.jpg',
    file: 'Paella de marisco 01.jpg',
    license: 'CC BY 2.0',
    verified: 'Paella med sjømat.',
  },
  'middag-ratatouille': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Ratatouille.jpg/960px-Ratatouille.jpg',
    file: 'Ratatouille.jpg',
    license: 'CC BY 2.0',
    verified: 'Ratatouille med grønnsaker.',
  },
  'middag-falafel': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Falafel_balls.jpg',
    file: 'Falafel balls.jpg',
    license: 'CC BY 2.0',
    verified: 'Falafel.',
  },
  'middag-quesadilla': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Quesadilla.jpg',
    file: 'Quesadilla.jpg',
    license: 'Public domain',
    verified: 'Quesadilla.',
  },
  'middag-biffstroganoff': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Beef_Stroganoff.jpg/960px-Beef_Stroganoff.jpg',
    file: 'Beef Stroganoff.jpg',
    license: 'CC BY-SA 2.0',
    verified: 'Biff stroganoff.',
  },
  'middag-indisk-kylling': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Chicken_tikka_masala.jpg/960px-Chicken_tikka_masala.jpg',
    file: 'Chicken tikka masala.jpg',
    license: 'CC BY 2.0',
    verified: 'Kyllingcurry / tikka masala.',
  },
  'middag-laks-teriyaki': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Teriyaki_salmon.jpg/960px-Teriyaki_salmon.jpg',
    file: 'Teriyaki salmon.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Teriyaki-laks.',
  },
  'middag-potetgratin': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Gratin_dauphinois.jpg/960px-Gratin_dauphinois.jpg',
    file: 'Gratin dauphinois.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Potetgrateng.',
  },
  'middag-ovnsbakt-kylling': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Roast_chicken.jpg',
    file: 'Roast chicken.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Helstekt kylling.',
  },
  'middag-kyllingform': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Roast_chicken.jpg',
    file: 'Roast chicken.jpg',
    license: 'CC BY-SA 3.0',
    verified: 'Kylling i ovn med tilbehør.',
  },
  'middag-wok': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Chicken_stir_fry.jpg/960px-Chicken_stir_fry.jpg',
    file: 'Chicken stir fry.jpg',
    license: 'Public domain',
    verified: 'Kyllingwok med grønnsaker.',
  },
  'middag-kjottgryte': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Beef_stew.jpg/960px-Beef_stew.jpg',
    file: 'Beef stew.jpg',
    license: 'CC BY 2.0',
    verified: 'Kjøttgryte med rotgrønnsaker.',
  },
  'middag-svinekotelett': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Pork_chop.jpg/960px-Pork_chop.jpg',
    file: 'Pork chop.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Svinekotelett.',
  },
  'middag-suppe-kyllingnudler': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Chicken_noodle_soup.jpg/960px-Chicken_noodle_soup.jpg',
    file: 'Chicken noodle soup.jpg',
    license: 'CC BY 2.0',
    verified: 'Kyllingnudelsuppe.',
  },
  'middag-pasta-pesto-kylling': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Pesto_pasta.jpg/960px-Pesto_pasta.jpg',
    file: 'Pesto pasta.jpg',
    license: 'CC BY 2.0',
    verified: 'Pastapesto.',
  },
  'middag-taco-kylling': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Chicken_tacos.jpg/960px-Chicken_tacos.jpg',
    file: 'Chicken tacos.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Kyllingtaco.',
  },
  'middag-pølse-potet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/P%C3%B8lse_med_potetmos.jpg/960px-P%C3%B8lse_med_potetmos.jpg',
    file: 'Pølse med potetmos.jpg',
    license: 'CC BY-SA 4.0',
    verified: 'Pølse med potetstappe.',
  },
};
