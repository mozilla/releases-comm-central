/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the fixed and format=flowed plain text renderers cap how deep
 * quoted lines are nested as blockquotes.
 */

async function render(body, flowed) {
  const contentType = flowed
    ? "text/plain; charset=UTF-8; format=flowed"
    : "text/plain; charset=UTF-8";
  return render_raw_message(
    "From: sender@example.invalid\r\n" +
      "To: recipient@example.invalid\r\n" +
      "Subject: Quote depth test\r\n" +
      `Content-Type: ${contentType}\r\n` +
      "\r\n" +
      body
  );
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

function countTags(html, tag) {
  return html.match(new RegExp(tag, "g"))?.length ?? 0;
}

for (const flowed of [false, true]) {
  const kind = flowed ? "flowed" : "fixed";

  add_task(async function testShallowQuotes() {
    const html = await render(
      "top\r\n> one\r\n>> two\r\n> one again\r\nbottom\r\n",
      flowed
    );
    Assert.equal(
      countTags(html, "<blockquote "),
      2,
      `${kind} text should open two blockquotes`
    );
    Assert.equal(maxDepth(html), 2, `${kind} quotes should nest two deep`);
  });

  add_task(async function testDeepQuoteIsCapped() {
    const html = await render(">".repeat(1000) + " deep\r\nafter\r\n", flowed);
    Assert.equal(
      countTags(html, "<blockquote "),
      100,
      `${kind} quote depth should be capped`
    );
    Assert.equal(maxDepth(html), 100, `${kind} nesting should stop at the cap`);
    Assert.ok(html.includes("deep"), `${kind} quoted text should be kept`);
    Assert.ok(html.includes("after"), `${kind} following text should be kept`);
  });

  add_task(async function testAlternatingDeepQuotes() {
    let body = "";
    for (let i = 0; i < 10; i++) {
      body += ">".repeat(1000) + ` deep ${i}\r\nshallow ${i}\r\n`;
    }
    const html = await render(body, flowed);
    Assert.equal(
      countTags(html, "<blockquote "),
      1000,
      `each deep ${kind} line should open blockquotes only up to the cap`
    );
    Assert.equal(
      countTags(html, "</blockquote>"),
      1000,
      `every ${kind} blockquote should be closed`
    );
    Assert.equal(maxDepth(html), 100, `${kind} nesting should stop at the cap`);
  });
}
