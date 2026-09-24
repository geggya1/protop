import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __test } from './aiRecipeImport.js';

const {
  stripHtml,
  extractMeta,
  extractFeaturedImage,
  extractPageTitle,
  extractJsonLdRecipes,
  parseIngredientsFromText,
  parseInstructionsFromText,
  localUrlFallback,
} = __test;

const sampleHtml = `
<html><head>
<meta property="og:title" content="KYLLING MED KREMET MANGOSAUS" />
<meta property="og:image" content="https://example.com/kylling.jpg" />
</head><body>
<h1>KYLLING MED KREMET MANGOSAUS</h1>
<p><strong>INGREDIENSER</strong></p>
<p>4 stk kyllingbryst<br />300 g mango chutney<br />1 dl fløte<br />salt og kvernet pepper</p>
<p><strong>TIL SERVERING</strong></p>
<p>ris, kokt</p>
<p><strong>SLIK GJØR DU</strong></p>
<p>Sett ovnen på 200 grader.</p>
<p>Brun kyllingen og hell over sausen.</p>
</body></html>
`;

const text = stripHtml(sampleHtml);
assert.match(text, /INGREDIENSER/i);
assert.match(text, /SLIK GJØR DU/i);

const ingredients = parseIngredientsFromText(text);
assert.ok(ingredients.length >= 3, `expected ingredients, got ${JSON.stringify(ingredients)}`);
assert.equal(ingredients[0].amount, '4 stk');
assert.match(ingredients[0].name, /kyllingbryst/i);
assert.ok(ingredients.every((i) => !/ris/i.test(i.name)), 'serving suggestions should be excluded');

const instructions = parseInstructionsFromText(text);
assert.match(instructions, /Sett ovnen/i);
assert.match(instructions, /^1\./m);

const page = {
  text,
  title: extractMeta(sampleHtml, 'og:title'),
  ogImage: extractFeaturedImage(sampleHtml, 'https://example.com/'),
  finalUrl: 'https://www.persilleogbasilikum.com/2022/02/25/kylling-med-kremet-mangosaus/',
  jsonLd: extractJsonLdRecipes(sampleHtml)[0] || null,
};
assert.equal(page.title, 'KYLLING MED KREMET MANGOSAUS');
assert.equal(page.ogImage, 'https://example.com/kylling.jpg');

const recipe = localUrlFallback(page);
assert.equal(recipe.title, 'KYLLING MED KREMET MANGOSAUS');
assert.ok(recipe.ingredients.length >= 3);
assert.match(recipe.instructions, /Sett ovnen/i);
assert.equal(
  recipe.sourceUrl,
  'https://www.persilleogbasilikum.com/2022/02/25/kylling-med-kremet-mangosaus/',
);
assert.equal(recipe.suggestedImageUrl, 'https://example.com/kylling.jpg');

// WordPress-style page without og:image — featured via wp-post-image / Elementor.
const wpHtml = `
<html><head><title>KYLLING MED KREMET MANGOSAUS – blog</title></head>
<body>
<img src="https://www.persilleogbasilikum.com/wp-content/uploads/2023/04/cropped-logo.png" width="90" height="55" />
<img class="attachment-bjorn-blog-thumb size-bjorn-blog-thumb wp-post-image"
  width="1140" height="700"
  src="https://www.persilleogbasilikum.com/wp-content/uploads/2022/02/Kylling-med-kremet-mangosaus-11-1140x700.jpg" />
<script>var elementorFrontendConfig = {"post":{"featuredImage":"https:\\/\\/www.persilleogbasilikum.com\\/wp-content\\/uploads\\/2022\\/02\\/Kylling-med-kremet-mangosaus-11-1024x768.jpg"}};</script>
<h1>KYLLING MED KREMET MANGOSAUS</h1>
<p><strong>INGREDIENSER</strong></p><p>4 stk kyllingbryst<br />1 dl fløte</p>
<p><strong>SLIK GJØR DU</strong></p><p>Sett ovnen på 200 grader.</p>
</body></html>
`;
const wpImage = extractFeaturedImage(
  wpHtml,
  'https://www.persilleogbasilikum.com/2022/02/25/kylling-med-kremet-mangosaus/',
);
assert.match(wpImage, /Kylling-med-kremet-mangosaus/i);
assert.doesNotMatch(wpImage, /logo/i);
assert.match(extractPageTitle(wpHtml), /kylling/i);

const wpRecipe = localUrlFallback({
  text: stripHtml(wpHtml),
  title: extractPageTitle(wpHtml),
  ogImage: wpImage,
  finalUrl: 'https://www.persilleogbasilikum.com/2022/02/25/kylling-med-kremet-mangosaus/',
  jsonLd: null,
});
assert.match(wpRecipe.suggestedImageUrl, /Kylling-med-kremet-mangosaus/i);
assert.match(wpRecipe.title, /kylling/i);

// Live HTML snapshot when available (fetched during agent verification).
for (const snap of ['/tmp/mango-recipe.html', '/tmp/mango2.html']) {
  try {
    const liveHtml = readFileSync(snap, 'utf8');
    const liveImage = extractFeaturedImage(
      liveHtml,
      'https://www.persilleogbasilikum.com/2022/02/25/kylling-med-kremet-mangosaus/',
    );
    const liveRecipe = localUrlFallback({
      text: stripHtml(liveHtml),
      title: extractPageTitle(liveHtml),
      ogImage: liveImage,
      finalUrl: 'https://www.persilleogbasilikum.com/2022/02/25/kylling-med-kremet-mangosaus/',
      jsonLd: extractJsonLdRecipes(liveHtml)[0] || null,
    });
    assert.match(liveRecipe.title, /kylling/i);
    assert.ok(liveRecipe.ingredients.some((i) => /mango/i.test(i.name)));
    assert.ok(liveRecipe.ingredients.some((i) => /kylling/i.test(i.name)));
    assert.match(liveRecipe.instructions, /ovnen|steke|kylling/i);
    assert.match(liveRecipe.suggestedImageUrl, /Kylling-med-kremet-mangosaus/i);
    console.log('live mango recipe ok:', {
      snap,
      title: liveRecipe.title,
      ingredients: liveRecipe.ingredients.length,
      image: liveRecipe.suggestedImageUrl,
    });
    break;
  } catch (err) {
    if (err?.code === 'ENOENT') continue;
    throw err;
  }
}

console.log('aiRecipeImport.test.mjs ok');
