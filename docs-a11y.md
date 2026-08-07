# Re-running the accessibility audit

Contrast is guarded by `tests/contrast.test.ts` and runs with `npm test` — that
part can't regress silently.

The full axe sweep is manual, because running it properly needs a real browser
(jsdom doesn't do layout, so it can't judge contrast or focus order, which are
the two things most likely to break).

To re-run it:

1. `npx cp node_modules/axe-core/axe.min.js public/_a11y/axe.min.js`
   (staged into `public/` only for the audit — delete it afterwards, it is 580KB)
2. Start the dev server and sign in.
3. In the browser console:

```js
const s = document.createElement('script');
s.src = '/_a11y/axe.min.js';
document.head.appendChild(s);
// then, once loaded:
(await axe.run(document, { resultTypes: ['violations'] })).violations
  .forEach(v => console.log(v.id, v.impact, v.nodes.length, v.help));
```

4. `rm -rf public/_a11y`

Do this for one page per role at minimum: a teacher page with a table, the
grading queue (the annotator is the most complex widget), the parent home, and
the student work list.

## What 8.1 fixed

- `--warn` #a8710f → #7a5209 (was 3.61:1 on `--warn-soft`, needs 4.5)
- `--mark-deep` #8fa524 → #6b7d18 (was 2.77:1 on white)
- Question-type `<select>` in the worksheet builder had no accessible name
- Empty `<th>` on five tables
- Six `h1 → h3` jumps that left holes in the document outline
- The family top bar was a `<div>`, so its links were outside any landmark
- The portal had no `<main>`
- No skip link in either shell
- No focus ring on sidebar links, accordion headers, pin stars, the More button
  or sign-out — all styled as bare elements
- The annotator was mouse-only: no keyboard path existed at all
- Held arrow keys dropped steps (stale closure in the key handler)
- No `prefers-reduced-motion` handling
