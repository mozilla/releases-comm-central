/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// These tests run into issues if there isn't a profile directory, see bug 1542397.
do_get_profile();

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var {
  cleanupImMarkup,
  createDerivedRuleset,
  addGlobalAllowedTag,
  removeGlobalAllowedTag,
  addGlobalAllowedAttribute,
  removeGlobalAllowedAttribute,
  addGlobalAllowedStyleRule,
  removeGlobalAllowedStyleRule,
} = ChromeUtils.import("resource:///modules/imContentSink.jsm");

var kModePref = "messenger.options.filterMode";
var kStrictMode = 0,
  kStandardMode = 1,
  kPermissiveMode = 2;

function run_test() {
  let defaultMode = Services.prefs.getIntPref(kModePref);

  add_test(test_strictMode);
  add_test(test_standardMode);
  add_test(test_permissiveMode);
  add_test(test_addGlobalAllowedTag);
  add_test(test_addGlobalAllowedAttribute);
  add_test(test_addGlobalAllowedStyleRule);
  add_test(test_createDerivedRuleset);

  Services.prefs.setIntPref(kModePref, defaultMode);
  run_next_test();
}

// Sanity check: a string without HTML markup shouldn't be modified.
function test_plainText() {
  const strings = [
    "foo",
    "foo  ", // preserve trailing whitespace
    "  foo", // preserve leading indent
    "&lt;html&gt;&amp;", // keep escaped characters
  ];
  for (let string of strings) {
    Assert.equal(string, cleanupImMarkup(string));
  }
}

function test_paragraphs() {
  const strings = ["<p>foo</p><p>bar</p>", "<p>foo<br>bar</p>", "foo<br>bar"];
  for (let string of strings) {
    Assert.equal(string, cleanupImMarkup(string));
  }
}

function test_stripScripts() {
  const strings = [
    ["<script>alert('hey')</script>", ""],
    ["foo <script>alert('hey')</script>", "foo "],
    ["<p onclick=\"alert('hey')\">foo</p>", "<p>foo</p>"],
    ["<p onmouseover=\"alert('hey')\">foo</p>", "<p>foo</p>"],
  ];
  for (let [input, expectedOutput] of strings) {
    Assert.equal(expectedOutput, cleanupImMarkup(input));
  }
}

function test_links() {
  // http, https, ftp and mailto links should be preserved.
  const ok = [
    "http://example.com/",
    "https://example.com/",
    "ftp://example.com/",
    "mailto:foo@example.com",
  ];
  for (let string of ok) {
    string = '<a href="' + string + '">foo</a>';
    Assert.equal(string, cleanupImMarkup(string));
  }

  // other links should be removed
  const bad = [
    "chrome://global/content/",
    "about:",
    "about:blank",
    "foo://bar/",
    "",
  ];
  for (let string of bad) {
    Assert.equal(
      "<a>foo</a>",
      cleanupImMarkup('<a href="' + string + '">foo</a>')
    );
  }

  // keep link titles
  let string = '<a title="foo bar">foo</a>';
  Assert.equal(string, cleanupImMarkup(string));
}

function test_allModes() {
  test_plainText();
  test_paragraphs();
  test_stripScripts();
  test_links();
  // Remove random classes.
  Assert.equal("<p>foo</p>", cleanupImMarkup('<p class="foobar">foo</p>'));
  // Test unparsable style.
  Assert.equal("<p>foo</p>", cleanupImMarkup('<p style="not-valid">foo</p>'));
}

function test_strictMode() {
  Services.prefs.setIntPref(kModePref, kStrictMode);
  test_allModes();

  // check that basic formatting is stripped in strict mode.
  for (let tag of [
    "div",
    "em",
    "strong",
    "b",
    "i",
    "u",
    "span",
    "code",
    "ul",
    "li",
    "ol",
    "cite",
    "blockquote",
  ]) {
    Assert.equal("foo", cleanupImMarkup("<" + tag + ">foo</" + tag + ">"));
  }

  // check that font settings are removed.
  Assert.equal(
    "foo",
    cleanupImMarkup('<font face="Times" color="pink">foo</font>')
  );
  Assert.equal(
    "<p>foo</p>",
    cleanupImMarkup('<p style="font-weight: bold;">foo</p>')
  );

  // Discard hr
  Assert.equal("foobar", cleanupImMarkup("foo<hr>bar"));

  run_next_test();
}

function test_standardMode() {
  Services.prefs.setIntPref(kModePref, kStandardMode);
  test_allModes();

  // check that basic formatting is kept in standard mode.
  for (let tag of [
    "div",
    "em",
    "strong",
    "b",
    "i",
    "u",
    "span",
    "code",
    "ul",
    "li",
    "ol",
    "cite",
    "blockquote",
  ]) {
    let string = "<" + tag + ">foo</" + tag + ">";
    Assert.equal(string, cleanupImMarkup(string));
  }

  // Keep special allowed classes.
  for (let className of ["moz-txt-underscore", "moz-txt-tag"]) {
    let string = '<span class="' + className + '">foo</span>';
    Assert.equal(string, cleanupImMarkup(string));
  }

  // Remove font settings
  let font_string = '<font face="Times" color="pink" size="3">foo</font>';
  Assert.equal("foo", cleanupImMarkup(font_string));

  // Discard hr
  Assert.equal("foobar", cleanupImMarkup("foo<hr>bar"));

  const okCSS = ["font-style: italic", "font-weight: bold"];
  for (let css of okCSS) {
    let string = '<span style="' + css + '">foo</span>';
    Assert.equal(string, cleanupImMarkup(string));
  }
  // text-decoration is a shorthand for several text-decoration properties, but
  // standard mode only allows text-decoration-line.
  Assert.equal(
    '<span style="text-decoration-line: underline;">foo</span>',
    cleanupImMarkup('<span style="text-decoration: underline">foo</span>')
  );

  const badCSS = [
    "color: pink;",
    "font-family: Times",
    "font-size: larger",
    "display: none",
    "visibility: hidden",
    "unsupported-by-gecko: blah",
  ];
  for (let css of badCSS) {
    Assert.equal(
      "<span>foo</span>",
      cleanupImMarkup('<span style="' + css + '">foo</span>')
    );
  }
  // The shorthand 'font' is decomposed to non-shorthand properties,
  // and not recomposed as some non-shorthand properties are filtered out.
  Assert.equal(
    '<span style="font-style: normal; font-weight: normal;">foo</span>',
    cleanupImMarkup('<span style="font: 15px normal">foo</span>')
  );

  run_next_test();
}

function test_permissiveMode() {
  Services.prefs.setIntPref(kModePref, kPermissiveMode);
  test_allModes();

  // Check that all formatting is kept in permissive mode.
  for (let tag of [
    "div",
    "em",
    "strong",
    "b",
    "i",
    "u",
    "span",
    "code",
    "ul",
    "li",
    "ol",
    "cite",
    "blockquote",
  ]) {
    let string = "<" + tag + ">foo</" + tag + ">";
    Assert.equal(string, cleanupImMarkup(string));
  }

  // Keep special allowed classes.
  for (let className of ["moz-txt-underscore", "moz-txt-tag"]) {
    let string = '<span class="' + className + '">foo</span>';
    Assert.equal(string, cleanupImMarkup(string));
  }

  // Keep font settings
  const fontAttributes = ['face="Times"', 'color="pink"', 'size="3"'];
  for (let fontAttribute of fontAttributes) {
    let string = "<font " + fontAttribute + ">foo</font>";
    Assert.equal(string, cleanupImMarkup(string));
  }

  // Allow hr
  let hr_string = "foo<hr>bar";
  Assert.equal(hr_string, cleanupImMarkup(hr_string));

  // Allow most CSS rules changing the text appearance.
  const okCSS = [
    "font-style: italic",
    "font-weight: bold",
    "color: pink;",
    "font-family: Times",
    "font-size: larger",
  ];
  for (let css of okCSS) {
    let string = '<span style="' + css + '">foo</span>';
    Assert.equal(string, cleanupImMarkup(string));
  }
  // text-decoration is a shorthand for several text-decoration properties, but
  // permissive mode only allows text-decoration-color, text-decoration-line,
  // and text-decoration-style.
  Assert.equal(
    '<span style="text-decoration-color: currentcolor; text-decoration-line: underline; text-decoration-style: solid;">foo</span>',
    cleanupImMarkup('<span style="text-decoration: underline;">foo</span>')
  );

  // The shorthand 'font' is decomposed to non-shorthand properties,
  // and not recomposed as some non-shorthand properties are filtered out.
  Assert.equal(
    '<span style="font-family: normal; font-size: 15px; ' +
      'font-style: normal; font-weight: normal;">foo</span>',
    cleanupImMarkup('<span style="font: 15px normal">foo</span>')
  );

  // But still filter out dangerous CSS rules.
  const badCSS = [
    "display: none",
    "visibility: hidden",
    "unsupported-by-gecko: blah",
  ];
  for (let css of badCSS) {
    Assert.equal(
      "<span>foo</span>",
      cleanupImMarkup('<span style="' + css + '">foo</span>')
    );
  }

  run_next_test();
}

function test_addGlobalAllowedTag() {
  Services.prefs.setIntPref(kModePref, kStrictMode);

  // Check that <hr> isn't allowed by default in strict mode.
  // Note: we use <hr> instead of <img> to avoid mailnews' content policy
  // messing things up.
  Assert.equal("", cleanupImMarkup("<hr>"));

  // Allow <hr> without attributes.
  addGlobalAllowedTag("hr");
  Assert.equal("<hr>", cleanupImMarkup("<hr>"));
  Assert.equal("<hr>", cleanupImMarkup('<hr src="http://example.com/">'));
  removeGlobalAllowedTag("hr");

  // Allow <hr> with an unfiltered src attribute.
  addGlobalAllowedTag("hr", { src: true });
  Assert.equal("<hr>", cleanupImMarkup('<hr alt="foo">'));
  Assert.equal(
    '<hr src="http://example.com/">',
    cleanupImMarkup('<hr src="http://example.com/">')
  );
  Assert.equal(
    '<hr src="chrome://global/skin/img.png">',
    cleanupImMarkup('<hr src="chrome://global/skin/img.png">')
  );
  removeGlobalAllowedTag("hr");

  // Allow <hr> with an src attribute taking only http(s) urls.
  addGlobalAllowedTag("hr", { src: aValue => /^https?:/.test(aValue) });
  Assert.equal(
    '<hr src="http://example.com/">',
    cleanupImMarkup('<hr src="http://example.com/">')
  );
  Assert.equal(
    "<hr>",
    cleanupImMarkup('<hr src="chrome://global/skin/img.png">')
  );
  removeGlobalAllowedTag("hr");

  run_next_test();
}

function test_addGlobalAllowedAttribute() {
  Services.prefs.setIntPref(kModePref, kStrictMode);

  // Check that id isn't allowed by default in strict mode.
  Assert.equal("<br>", cleanupImMarkup('<br id="foo">'));

  // Allow id unconditionally.
  addGlobalAllowedAttribute("id");
  Assert.equal('<br id="foo">', cleanupImMarkup('<br id="foo">'));
  removeGlobalAllowedAttribute("id");

  // Allow id only with numbers.
  addGlobalAllowedAttribute("id", aId => /^\d+$/.test(aId));
  Assert.equal('<br id="123">', cleanupImMarkup('<br id="123">'));
  Assert.equal("<br>", cleanupImMarkup('<br id="foo">'));
  removeGlobalAllowedAttribute("id");

  run_next_test();
}

function test_addGlobalAllowedStyleRule() {
  // We need at least the standard mode to have the style attribute allowed.
  Services.prefs.setIntPref(kModePref, kStandardMode);

  // Check that clear isn't allowed by default in strict mode.
  Assert.equal("<br>", cleanupImMarkup('<br style="clear: both;">'));

  // Allow clear.
  addGlobalAllowedStyleRule("clear");
  Assert.equal(
    '<br style="clear: both;">',
    cleanupImMarkup('<br style="clear: both;">')
  );
  removeGlobalAllowedStyleRule("clear");

  run_next_test();
}

function test_createDerivedRuleset() {
  Services.prefs.setIntPref(kModePref, kStandardMode);

  let rules = createDerivedRuleset();

  let string = "<hr>";
  Assert.equal("", cleanupImMarkup(string));
  Assert.equal("", cleanupImMarkup(string, rules));
  rules.tags.hr = true;
  Assert.equal(string, cleanupImMarkup(string, rules));

  string = '<br id="123">';
  Assert.equal("<br>", cleanupImMarkup(string));
  Assert.equal("<br>", cleanupImMarkup(string, rules));
  rules.attrs.id = true;
  Assert.equal(string, cleanupImMarkup(string, rules));

  string = '<br style="clear: both;">';
  Assert.equal("<br>", cleanupImMarkup(string));
  Assert.equal("<br>", cleanupImMarkup(string, rules));
  rules.styles.clear = true;
  Assert.equal(string, cleanupImMarkup(string, rules));

  run_next_test();
}
