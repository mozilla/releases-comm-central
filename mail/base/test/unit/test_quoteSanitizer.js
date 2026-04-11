/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { QuoteSanitizer } = ChromeUtils.importESModule(
  "resource:///modules/QuoteSanitizer.sys.mjs"
);

function makeDoc(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

// Phase 1: Body attribute stripping.

add_task(function test_bodyColorAttributesRemoved() {
  const doc = makeDoc(
    '<html><body bgcolor="#ffffff" text="#000000" background="bg.jpg" ' +
      'link="blue" vlink="purple" alink="red" class="keep-me">' +
      "</body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  for (const attr of [
    "bgcolor",
    "text",
    "background",
    "link",
    "vlink",
    "alink",
  ]) {
    Assert.ok(
      !doc.body.hasAttribute(attr),
      `Body attribute "${attr}" should be removed`
    );
  }
  Assert.equal(
    doc.body.getAttribute("class"),
    "keep-me",
    "Non-color body attributes should be preserved"
  );
});

add_task(function test_bodyInlineColorStylesRemoved() {
  const doc = makeDoc(
    '<html><body style="background-color: red; background: blue; ' +
      'color: green; font-size: 14px;"></body></html>'
  );
  QuoteSanitizer.sanitize(doc);

  Assert.equal(
    doc.body.style.getPropertyValue("background-color"),
    "",
    "background-color should be removed"
  );
  Assert.equal(
    doc.body.style.getPropertyValue("background"),
    "",
    "background should be removed"
  );
  Assert.equal(
    doc.body.style.getPropertyValue("color"),
    "",
    "color should be removed"
  );
  Assert.equal(
    doc.body.style.getPropertyValue("font-size"),
    "14px",
    "Non-color styles should be preserved"
  );
});

// Phase 2: <style> element scoping.

add_task(function test_styleScopedInBlockquote() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite"><style>body { color: red; }</style>' +
      "<p>Quoted text</p></blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const style = doc.querySelector("style");
  Assert.ok(style, "<style> inside blockquote should be preserved");
  Assert.ok(
    style.textContent.startsWith("@scope {"),
    "<style> content should be wrapped in implicit @scope"
  );
  Assert.ok(
    style.textContent.includes("body { color: red; }"),
    "Original rules should be preserved inside @scope"
  );
});

add_task(function test_styleScopedInForwardContainer() {
  const doc = makeDoc(
    "<html><body>" +
      '<div class="moz-forward-container">' +
      "<style>.newsletter { background: pink; }</style>" +
      "<p>Forwarded text</p></div></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const style = doc.querySelector("style");
  Assert.ok(style, "<style> inside forward container should be preserved");
  Assert.ok(
    style.textContent.startsWith("@scope {"),
    "<style> content should be wrapped in implicit @scope"
  );
});

add_task(function test_headStyleScopedExplicitly() {
  const doc = makeDoc(
    "<html><head><style>body { background: yellow; }</style></head>" +
      "<body><p>Content</p></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const style = doc.querySelector("head style");
  Assert.ok(style, "<style> in <head> should be preserved");
  Assert.ok(
    style.textContent.includes('blockquote[type="cite"]'),
    "Head <style> should be scoped to blockquote"
  );
  Assert.ok(
    style.textContent.includes(".moz-forward-container"),
    "Head <style> should be scoped to forward container"
  );
});

add_task(function test_styleOutsideQuotedContentPreserved() {
  const doc = makeDoc(
    "<html><body>" +
      "<style>.my-compose-style { font-weight: bold; }</style>" +
      '<blockquote type="cite"><p>Quoted text</p></blockquote>' +
      "</body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const style = doc.querySelector("body > style");
  Assert.ok(style, "<style> outside quoted content should be preserved");
  Assert.ok(
    !style.textContent.includes("@scope"),
    "<style> outside quoted content should not be scoped"
  );
});

// Phase 3: Wrapper background stripping.

add_task(function test_topLevelWrapperBackgroundStripped() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      '<div style="background-color: #ff0000; padding: 10px;">Content</div>' +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const div = doc.querySelector("blockquote div");
  Assert.equal(
    div.style.getPropertyValue("background-color"),
    "",
    "background-color on top-level wrapper should be removed"
  );
  Assert.equal(
    div.style.getPropertyValue("padding"),
    "10px",
    "Non-background styles should be preserved"
  );
});

add_task(function test_topLevelWrapperBackgroundShorthandStripped() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      '<table style="background: #ccc url(bg.png) no-repeat;">' +
      "<tr><td>Cell</td></tr></table>" +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const table = doc.querySelector("blockquote table");
  Assert.equal(
    table.style.getPropertyValue("background"),
    "",
    "background shorthand on top-level wrapper should be removed"
  );
});

add_task(function test_nestedElementBackgroundPreserved() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      "<div>" +
      '<span style="background-color: yellow;">Highlighted</span>' +
      "</div>" +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const span = doc.querySelector("blockquote span");
  Assert.equal(
    span.style.getPropertyValue("background-color"),
    "yellow",
    "background-color on nested non-wrapper elements should be preserved"
  );
});

add_task(function test_forwardContainerWrapperStripped() {
  const doc = makeDoc(
    "<html><body>" +
      '<div class="moz-forward-container">' +
      '<section style="background-color: #eee; font-size: 16px;">' +
      "Forwarded</section>" +
      "</div></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const section = doc.querySelector(".moz-forward-container section");
  Assert.equal(
    section.style.getPropertyValue("background-color"),
    "",
    "background-color on forward container wrapper should be removed"
  );
  Assert.equal(
    section.style.getPropertyValue("font-size"),
    "16px",
    "Non-background styles should be preserved"
  );
});

// Edge cases.

add_task(function test_noQuotedContentUnchanged() {
  const doc = makeDoc(
    '<html><body style="font-family: sans-serif;">' +
      '<div style="background-color: blue;">User content</div>' +
      "</body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const div = doc.querySelector("div");
  Assert.equal(
    div.style.getPropertyValue("background-color"),
    "blue",
    "Non-quoted content should not be modified"
  );
});

add_task(function test_multipleQuotedBlocks() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      "<style>.a { color: red; }</style>" +
      '<div style="background-color: red;">First</div>' +
      "</blockquote>" +
      '<blockquote type="cite">' +
      "<style>.b { color: blue; }</style>" +
      '<div style="background-color: blue;">Second</div>' +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc);

  const styles = doc.querySelectorAll("style");
  Assert.equal(styles.length, 2, "Both <style> elements should be preserved");
  for (const style of styles) {
    Assert.ok(
      style.textContent.startsWith("@scope {"),
      "Each <style> should be wrapped in @scope"
    );
  }
  for (const div of doc.querySelectorAll("blockquote div")) {
    Assert.equal(
      div.style.getPropertyValue("background-color"),
      "",
      "background-color should be removed from all quoted wrappers"
    );
  }
});

add_task(function test_emptyDocument() {
  const doc = makeDoc("<html><body></body></html>");
  QuoteSanitizer.sanitize(doc);
  Assert.ok(true, "Empty document should not throw");
});
