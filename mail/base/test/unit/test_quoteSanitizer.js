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
  QuoteSanitizer.sanitize(doc, false);

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
  QuoteSanitizer.sanitize(doc, false);

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
  QuoteSanitizer.sanitize(doc, false);

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
  QuoteSanitizer.sanitize(doc, false);

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
  QuoteSanitizer.sanitize(doc, false);

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
  QuoteSanitizer.sanitize(doc, false);

  const style = doc.querySelector("body > style");
  Assert.ok(style, "<style> outside quoted content should be preserved");
  Assert.ok(
    !style.textContent.includes("@scope"),
    "<style> outside quoted content should not be scoped"
  );
});

// Phase 3: Dark mode inline style sanitization.

add_task(function test_darkModeBrightBackgroundStripped() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      '<div style="background-color: white; color: black;">Content</div>' +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc, true);

  const div = doc.querySelector("blockquote div");
  Assert.equal(
    div.style.getPropertyValue("background-color"),
    "",
    "Bright background should be stripped in dark mode"
  );
  Assert.equal(
    div.style.getPropertyValue("color"),
    "",
    "Dark text color should be stripped when background is removed"
  );
});

add_task(function test_darkModeDarkBackgroundPreserved() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      '<div style="background-color: #222; color: #eee;">Content</div>' +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc, true);

  const div = doc.querySelector("blockquote div");
  Assert.equal(
    div.style.getPropertyValue("background-color"),
    "rgb(34, 34, 34)",
    "Dark background should be preserved in dark mode"
  );
});

add_task(function test_darkModeBgcolorAttributeStripped() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      '<table bgcolor="#ffffff"><tr><td>Cell</td></tr></table>' +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc, true);

  const table = doc.querySelector("blockquote table");
  Assert.ok(
    !table.hasAttribute("bgcolor"),
    "bgcolor attribute should be stripped in dark mode"
  );
});

add_task(function test_darkModeDoesNotAffectOutsideQuote() {
  const doc = makeDoc(
    "<html><body>" +
      '<div style="background-color: white;">User content</div>' +
      '<blockquote type="cite"><p>Quoted</p></blockquote>' +
      "</body></html>"
  );
  QuoteSanitizer.sanitize(doc, true);

  const div = doc.querySelector("body > div");
  Assert.equal(
    div.style.getPropertyValue("background-color"),
    "white",
    "Content outside quoted area should not be touched in dark mode"
  );
});

add_task(function test_lightModePreservesInlineStyles() {
  const doc = makeDoc(
    "<html><body>" +
      '<blockquote type="cite">' +
      '<div style="background-color: white; color: black;">Content</div>' +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc, false);

  const div = doc.querySelector("blockquote div");
  Assert.equal(
    div.style.getPropertyValue("background-color"),
    "white",
    "Inline styles should be preserved in light mode"
  );
  Assert.equal(
    div.style.getPropertyValue("color"),
    "black",
    "Inline text color should be preserved in light mode"
  );
});

// Edge cases.

add_task(function test_noQuotedContentUnchanged() {
  const doc = makeDoc(
    '<html><body style="font-family: sans-serif;">' +
      '<div style="background-color: blue;">User content</div>' +
      "</body></html>"
  );
  QuoteSanitizer.sanitize(doc, false);

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
      "<p>First</p>" +
      "</blockquote>" +
      '<blockquote type="cite">' +
      "<style>.b { color: blue; }</style>" +
      "<p>Second</p>" +
      "</blockquote></body></html>"
  );
  QuoteSanitizer.sanitize(doc, false);

  const styles = doc.querySelectorAll("style");
  Assert.equal(styles.length, 2, "Both <style> elements should be preserved");
  for (const style of styles) {
    Assert.ok(
      style.textContent.startsWith("@scope {"),
      "Each <style> should be wrapped in @scope"
    );
  }
});

add_task(function test_emptyDocument() {
  const doc = makeDoc("<html><body></body></html>");
  QuoteSanitizer.sanitize(doc, false);
  Assert.ok(true, "Empty document should not throw");
});
