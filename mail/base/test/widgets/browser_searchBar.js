/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});
let browser;
let searchBar;

const waitForRender = () => {
  return new Promise(resolve => {
    window.requestAnimationFrame(resolve);
  });
};

/* These are shadow-root safe variants of the methods in BrowserTestUtils. */

/**
 * Checks if a DOM element is hidden.
 *
 * @param {Element} element
 *        The element which is to be checked.
 *
 * @return {boolean}
 */
function is_hidden(element) {
  var style = element.ownerGlobal.getComputedStyle(element);
  if (style.display == "none") {
    return true;
  }
  if (style.visibility != "visible") {
    return true;
  }
  if (style.display == "-moz-popup") {
    return ["hiding", "closed"].includes(element.state);
  }

  // Hiding a parent element will hide all its children
  if (element.parentNode != element.ownerDocument && element.parentElement) {
    return is_hidden(element.parentElement);
  }

  return false;
}

/**
 * Checks if a DOM element is visible.
 *
 * @param {Element} element
 *        The element which is to be checked.
 *
 * @return {boolean}
 */
function is_visible(element) {
  var style = element.ownerGlobal.getComputedStyle(element);
  if (style.display == "none") {
    return false;
  }
  if (style.visibility != "visible") {
    return false;
  }
  if (style.display == "-moz-popup" && element.state != "open") {
    return false;
  }

  // Hiding a parent element will hide all its children
  if (element.parentNode != element.ownerDocument && element.parentElement) {
    return is_visible(element.parentElement);
  }

  return true;
}

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/widgets/files/searchBar.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  searchBar = tab.browser.contentWindow.document.querySelector("search-bar");
});

add_task(async function test_initialState() {
  const input = searchBar.shadowRoot.querySelector("input");
  is(
    input.getAttribute("aria-label"),
    searchBar.getAttribute("label"),
    "Label forwarded to aria-label on input"
  );
});

add_task(async function test_labelUpdate() {
  const input = searchBar.shadowRoot.querySelector("input");
  searchBar.setAttribute("label", "foo");
  await waitForRender();
  is(
    input.getAttribute("aria-label"),
    "foo",
    "Updated label applied to content"
  );
});

add_task(async function test_focus() {
  const input = searchBar.shadowRoot.querySelector("input");
  searchBar.focus();
  is(
    searchBar.shadowRoot.activeElement,
    input,
    "Input is focused when search bar is focused"
  );

  input.blur();
  input.value = "foo";

  searchBar.focus();
  is(
    searchBar.shadowRoot.activeElement,
    input,
    "Input is focused when search bar is focused"
  );
  is(input.selectionStart, 0, "Selection at the beginning");
  is(input.selectionEnd, 3, "Selection to the end");

  searchBar.reset();
});

add_task(async function test_autocompleteEvent() {
  const typeAndWaitForAutocomplete = async key => {
    const eventPromise = BrowserTestUtils.waitForEvent(
      searchBar,
      "autocomplete"
    );
    await BrowserTestUtils.synthesizeKey(key, {}, browser);
    return eventPromise;
  };
  searchBar.focus();
  let event = await typeAndWaitForAutocomplete("T");
  is(event.detail, "T", "Autocomplete for T");

  event = await typeAndWaitForAutocomplete("e");
  is(event.detail, "Te", "Autocomplete for e");

  event = await typeAndWaitForAutocomplete("KEY_Backspace");
  is(event.detail, "T", "Autocomplete for backspace");

  await BrowserTestUtils.synthesizeKey("KEY_Backspace", {}, browser);
});

add_task(async function test_searchEventFromEnter() {
  const input = searchBar.shadowRoot.querySelector("input");
  input.value = "Lorem ipsum";
  searchBar.focus();

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "search");
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  const event = await eventPromise;

  is(event.detail, "Lorem ipsum", "Event contains search query");
  await waitForRender();
  is(input.value, "", "Input was cleared");
});

add_task(async function test_searchEventFromButton() {
  const input = searchBar.shadowRoot.querySelector("input");
  input.value = "Lorem ipsum";

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "search");
  searchBar.shadowRoot.querySelector("button").click();
  const event = await eventPromise;

  is(event.detail, "Lorem ipsum", "Event contains search query");
  await waitForRender();
  is(input.value, "", "Input was cleared");
});

add_task(async function test_searchEventPreventDefault() {
  const input = searchBar.shadowRoot.querySelector("input");
  input.value = "Lorem ipsum";

  searchBar.addEventListener(
    "search",
    event => {
      event.preventDefault();
    },
    {
      once: true,
      passive: false,
    }
  );

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "search");
  searchBar.shadowRoot.querySelector("button").click();
  await eventPromise;
  await waitForRender();

  is(input.value, "Lorem ipsum");

  input.value = "";
});

add_task(async function test_placeholderVisibility() {
  const placeholder = searchBar.shadowRoot.querySelector("div");
  const input = searchBar.shadowRoot.querySelector("input");

  input.value = "";
  await waitForRender();
  ok(is_visible(placeholder), "Placeholder is visible initially");

  input.value = "some input";
  await waitForRender();
  ok(is_hidden(placeholder), "Placeholder is hidden after text is entered");

  input.value = "";
  await waitForRender();
  ok(
    is_visible(placeholder),
    "Placeholder is visible again after input is cleared"
  );
});

add_task(async function test_placeholderFallbackToLabel() {
  const placeholder = searchBar.querySelector("span");
  placeholder.remove();

  const shadowedPlaceholder = searchBar.shadowRoot.querySelector("div");
  const label = searchBar.getAttribute("label");

  is(
    shadowedPlaceholder.textContent,
    label,
    "Falls back to label if no placeholder slot contents provided"
  );

  searchBar.setAttribute("label", "Foo bar");
  is(
    shadowedPlaceholder.textContent,
    "Foo bar",
    "Placeholder contents get updated with label attribute"
  );

  searchBar.prepend(placeholder);
  searchBar.setAttribute("label", label);
});

add_task(async function test_reset() {
  const input = searchBar.shadowRoot.querySelector("input");
  const placeholder = searchBar.shadowRoot.querySelector("div");
  input.value = "Lorem ipsum";

  searchBar.reset();

  is(input.value, "", "Input empty after reset");
  await waitForRender();
  ok(is_visible(placeholder), "Placeholder visible");
});

add_task(async function test_disabled() {
  const input = searchBar.shadowRoot.querySelector("input");
  const button = searchBar.shadowRoot.querySelector("button");

  ok(!input.disabled, "Input enabled");
  ok(!button.disabled, "Button enabled");

  searchBar.setAttribute("disabled", true);

  ok(input.disabled, "Disabled propagated to input");
  ok(button.disabled, "Disabled propagated to button");

  searchBar.removeAttribute("disabled");

  ok(!input.disabled, "Input enabled again");
  ok(!button.disabled, "Button enabled again");
});

add_task(async function test_clearWithEscape() {
  const input = searchBar.shadowRoot.querySelector("input");

  searchBar.focus();
  input.value = "foo bar";

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  await BrowserTestUtils.synthesizeKey("KEY_Escape", {}, browser);
  const event = await eventPromise;

  is(event.detail, "", "Autocomplete event with empty value");
  is(input.value, "", "Input was cleared");
});
