/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2PageGenerator } = ChromeUtils.importESModule(
  "moz-src:///comm/mailnews/base/src/OAuth2PageGenerator.sys.mjs"
);

const parser = new DOMParser();

/**
 * Check if a custom property has a value defined in a style sheet.
 *
 * @param {string} customProperty - The var() value referencing a custom
 *   property.
 * @param {CSSStyleSheet} styleSheet - The style sheet to find the definition
 *   in.
 * @returns {boolean} If a definition for the custom property was found in the
 *   style sheet.
 */
function hasCustomPropertyValue(customProperty, styleSheet) {
  // Remove the var() wrapper.
  const propertyName = customProperty.slice(4, -1);
  for (const rule of styleSheet.cssRules) {
    if (rule.style?.getPropertyValue(propertyName)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks that apply to both variants of the generated page.
 *
 * @param {string} pageSource - The source of the generated page.
 * @returns {HTMLDocument} Parsed document representation of the source.
 */
function subtest_commonPageChecks(pageSource) {
  const parsed = parser.parseFromString(pageSource, "text/html");

  Assert.ok(parsed.title, "Should have a title set");
  Assert.equal(
    parsed.dir,
    Services.locale.isAppLocaleRTL ? "rtl" : "ltr",
    "Should have document direction set based on app locale"
  );
  Assert.equal(
    parsed.documentElement.lang,
    Services.locale.appLocaleAsBCP47,
    "Should have app language as document language"
  );
  Assert.ok(
    parsed.head.querySelector('link[rel="icon"][href]'),
    "Should have a favicon"
  );
  Assert.greaterOrEqual(
    parsed.getElementById("brandLogo").childElementCount,
    1,
    "Should have a brand logo inserted"
  );
  Assert.equal(
    parsed.querySelector("#brandLogo svg").role,
    "image",
    "Brand logo svg should present as an image"
  );
  Assert.greaterOrEqual(
    parsed.getElementById("wordmark").childElementCount,
    1,
    "Should have a brand wordmark inserted"
  );
  Assert.equal(
    parsed.querySelector("#wordmark svg").role,
    "image",
    "Brand wordmark svg should present as image"
  );
  Assert.ok(
    parsed.querySelector("#wordmark svg").ariaLabel,
    "Wordmark should be labeled"
  );

  Assert.ok(
    parsed.getElementById("title").textContent,
    "Should have inserted a title"
  );
  Assert.ok(
    parsed.getElementById("subtitle").textContent,
    "Should have inserted a subtitle"
  );
  Assert.ok(
    parsed.getElementById("body").textContent,
    "Should have inserted a body"
  );

  const footerLink = parsed.getElementById("footerLink");
  Assert.equal(
    footerLink.href,
    "https://support.thunderbird.net/home",
    "Footer link should go to main support page"
  );
  Assert.ok(
    footerLink.textContent,
    "Should have inserted text for the footer link"
  );
  Assert.equal(
    footerLink.target,
    "_blank",
    "Footer link should open in a new tab"
  );

  Assert.equal(parsed.styleSheets.length, 2, "Should have two stylesheets");
  const colorStyles = parsed.styleSheets[0];
  const primaryStyles = parsed.styleSheets[1].cssRules;
  const htmlRules = primaryStyles.item(0);
  Assert.equal(
    htmlRules.selectorText,
    "html",
    "Should have rules for the html element"
  );
  Assert.ok(
    hasCustomPropertyValue(htmlRules.style.background, colorStyles),
    "Should have a definition for the document background color value"
  );
  Assert.ok(
    hasCustomPropertyValue(htmlRules.style.color, colorStyles),
    "Should have a definition for the document text color value"
  );
  const mainRules = primaryStyles.item(1);
  Assert.equal(
    mainRules.selectorText,
    "main",
    "Should have rules for main element"
  );
  Assert.ok(
    hasCustomPropertyValue(mainRules.style.background, colorStyles),
    "Should have a definition for the main element background color"
  );

  return parsed;
}

add_task(async function test_generateSuccessPage() {
  const pageSource = await OAuth2PageGenerator.generateSuccessPage();
  subtest_commonPageChecks(pageSource);
});

add_task(async function test_generateErrorPage() {
  const pageSource = await OAuth2PageGenerator.generateErrorPage();
  const parsed = subtest_commonPageChecks(pageSource);
  const inlineLink = parsed.querySelector("#body a");
  Assert.stringMatches(
    inlineLink.href,
    /^https:\/\/support\.thunderbird\.net\//,
    "Body should have a link to the support page"
  );
  Assert.equal(
    inlineLink.target,
    "_blank",
    "Inline link should open in a new tab"
  );
});

add_task(async function test_successAndErrorPageAreDifferent() {
  const successPage = await OAuth2PageGenerator.generateSuccessPage();
  const errorPage = await OAuth2PageGenerator.generateErrorPage();
  // Only assert the full strings if the length is equal to save on lines
  // logged.
  if (successPage.length === errorPage.length) {
    Assert.notEqual(
      successPage,
      errorPage,
      "Success and error page should be different"
    );
  } else {
    Assert.notEqual(
      successPage.length,
      errorPage.length,
      "Success and error page should have different content lengths"
    );
  }
});
