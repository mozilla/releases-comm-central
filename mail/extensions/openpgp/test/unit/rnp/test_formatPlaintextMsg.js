/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests rendering of quoted plain text in inline OpenPGP messages.
 */

"use strict";

const { EnigmailFuncs } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/funcs.sys.mjs"
);

function countBlockquotes(html) {
  return html.match(/<blockquote /g)?.length ?? 0;
}

function maxDepth(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let depth = 0;
  for (const bq of doc.querySelectorAll("blockquote")) {
    let d = 0;
    for (let el = bq; el; el = el.parentElement?.closest("blockquote")) {
      d++;
    }
    depth = Math.max(depth, d);
  }
  return depth;
}

add_task(function testShallowQuotes() {
  const html = EnigmailFuncs.formatPlaintextMsg(
    "top\n> one\n>> two\n> one again\nbottom"
  );
  Assert.equal(countBlockquotes(html), 2, "should open two blockquotes");
  Assert.equal(maxDepth(html), 2, "quotes should nest two levels deep");
  Assert.ok(html.includes("two"), "quoted text should be kept");
});

add_task(function testDeepQuoteIsCapped() {
  const html = EnigmailFuncs.formatPlaintextMsg(
    ">".repeat(1000) + " deep\nafter"
  );
  Assert.equal(countBlockquotes(html), 100, "quote depth should be capped");
  Assert.equal(maxDepth(html), 100, "nesting should stop at the cap");
  Assert.ok(html.includes("deep"), "deeply quoted text should be kept");
  Assert.ok(html.includes("after"), "following text should be kept");
});

add_task(function testAlternatingDeepQuotes() {
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push(">".repeat(1000) + " deep " + i, "shallow " + i);
  }
  const html = EnigmailFuncs.formatPlaintextMsg(lines.join("\n"));
  Assert.equal(
    countBlockquotes(html),
    1000,
    "each deep line should open blockquotes only up to the cap"
  );
  Assert.equal(maxDepth(html), 100, "nesting should stop at the cap");
  Assert.equal(
    html.match(/<\/blockquote>/g).length,
    1000,
    "every blockquote should be closed"
  );
});
