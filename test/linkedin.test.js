// Quick, dependency-free checks for the link->embed conversion.
// Run with: npm test
const assert = require('assert');
const { toEmbedUrl, extractFirstUrl, EMBED_URL_REGEX } = require('../src/linkedin');

const ID = '7300000000000000000';
const EXPECTED = `https://www.linkedin.com/embed/feed/update/urn:li:activity:${ID}`;

const cases = [
  // [description, input, expectedEmbedUrl]
  [
    'plain /posts/ activity link',
    `https://www.linkedin.com/posts/jane-doe_hiring-phd-activity-${ID}-abcd`,
    EXPECTED
  ],
  [
    '/posts/ share-style link -> share urn',
    `https://www.linkedin.com/posts/jane-doe_hiring-postdoc-share-${ID}-uwfY/?utm_source=social_share_send`,
    `https://www.linkedin.com/embed/feed/update/urn:li:share:${ID}`
  ],
  [
    '/feed/update urn link',
    `https://www.linkedin.com/feed/update/urn:li:activity:${ID}/`,
    EXPECTED
  ],
  [
    '/feed/update share urn',
    `https://www.linkedin.com/feed/update/urn:li:share:${ID}`,
    `https://www.linkedin.com/embed/feed/update/urn:li:share:${ID}`
  ],
  [
    'ugcPost urn',
    `https://www.linkedin.com/feed/update/urn:li:ugcPost:${ID}`,
    `https://www.linkedin.com/embed/feed/update/urn:li:ugcPost:${ID}`
  ],
  [
    'already an embed URL (kept, query stripped)',
    `https://www.linkedin.com/embed/feed/update/urn:li:activity:${ID}?a=b`,
    EXPECTED
  ],
  [
    'link with tracking query params',
    `https://www.linkedin.com/posts/jane_x-activity-${ID}-wxyz?utm_source=share`,
    EXPECTED
  ]
];

let passed = 0;
for (const [desc, input, expected] of cases) {
  const got = toEmbedUrl(input);
  assert.strictEqual(got, expected, `FAILED: ${desc}\n  input:    ${input}\n  expected: ${expected}\n  got:      ${got}`);
  // Every produced embed URL must satisfy the backend's own regex.
  assert.ok(EMBED_URL_REGEX.test(got), `FAILED: produced URL rejected by backend regex: ${got}`);
  console.log(`ok  ${desc}`);
  passed++;
}

// Non-LinkedIn / junk should not produce an embed URL.
assert.strictEqual(toEmbedUrl('https://example.com/foo'), null, 'non-linkedin should be null');
console.log('ok  non-linkedin returns null');
passed++;

// extractFirstUrl pulls the link out of surrounding chat text.
assert.strictEqual(
  extractFirstUrl(`check this out ${EXPECTED} cool right?`),
  EXPECTED,
  'extractFirstUrl should find embedded url'
);
console.log('ok  extractFirstUrl finds url in text');
passed++;

console.log(`\nAll ${passed} tests passed.`);
