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
const typeAndWaitForAutocomplete = async key => {
  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  await BrowserTestUtils.synthesizeKey(key, {}, browser);
  return eventPromise;
};
const ensureNoMoreEvents = async () => {
  // Wait for longer than the timer's delay to be sure no more events fire.
  const failListener = () => {
    ok(false, "Should not have seen an autocomplete event");
  };
  searchBar.addEventListener("autocomplete", failListener, { once: true });
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  searchBar.removeEventListener("autocomplete", failListener);
};

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
  is(
    searchBar.shadowRoot.querySelector("slot[name=placeholder]").textContent,
    searchBar.getAttribute("placeholder"),
    "Placeholder forwarded to placeholder slot"
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

add_task(async function test_placeholderUpdate() {
  searchBar.setAttribute("placeholder", "bar");
  await waitForRender();
  is(
    searchBar.shadowRoot.querySelector("slot[name=placeholder]").textContent,
    "bar",
    "Updated placeholder applied to placeholder slot"
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
  searchBar.focus();
  let event = await typeAndWaitForAutocomplete("T");
  is(event.detail, "T", "Autocomplete for T");

  event = await typeAndWaitForAutocomplete("e");
  is(event.detail, "Te", "Autocomplete for e");

  event = await typeAndWaitForAutocomplete("KEY_Backspace");
  is(event.detail, "T", "Autocomplete for backspace");

  event = await typeAndWaitForAutocomplete("KEY_Backspace");
  is(event.detail, "", "Autocomplete for backspace");

  await ensureNoMoreEvents();
});

add_task(async function test_searchEventFromEnter() {
  const input = searchBar.shadowRoot.querySelector("input");
  searchBar.focus();
  EventUtils.sendString("Lorem ipsum", browser.contentWindow);

  const autocompletePromise = BrowserTestUtils.waitForEvent(
    searchBar,
    "autocomplete"
  );
  const searchPromise = BrowserTestUtils.waitForEvent(searchBar, "search");
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  const autocompleteEvent = await autocompletePromise;
  const searchEvent = await searchPromise;

  Assert.lessOrEqual(
    autocompleteEvent.timeStamp,
    searchEvent.timeStamp,
    "autocomplete event happened before search event"
  );
  is(
    autocompleteEvent.detail,
    "Lorem ipsum",
    "autocomplete event contains search query"
  );
  is(searchEvent.detail, "Lorem ipsum", "search event contains search query");
  await waitForRender();
  is(input.value, "", "Input was cleared");

  await ensureNoMoreEvents();
});

add_task(async function test_searchEventFromButton() {
  const input = searchBar.shadowRoot.querySelector("input");
  searchBar.focus();
  EventUtils.sendString("Lorem ipsum", browser.contentWindow);

  const autocompletePromise = BrowserTestUtils.waitForEvent(
    searchBar,
    "autocomplete"
  );
  const searchPromise = BrowserTestUtils.waitForEvent(searchBar, "search");
  searchBar.shadowRoot.querySelector("#search-button").click();
  const autocompleteEvent = await autocompletePromise;
  const searchEvent = await searchPromise;

  Assert.lessOrEqual(
    autocompleteEvent.timeStamp,
    searchEvent.timeStamp,
    "autocomplete event happened before search event"
  );
  is(
    autocompleteEvent.detail,
    "Lorem ipsum",
    "autocomplete event contains search query"
  );
  is(searchEvent.detail, "Lorem ipsum", "search event contains search query");
  await waitForRender();
  is(input.value, "", "Input was cleared");

  await ensureNoMoreEvents();
});

add_task(async function test_searchEventPreventDefault() {
  const input = searchBar.shadowRoot.querySelector("input");
  EventUtils.sendString("Lorem ipsum", browser.contentWindow);

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

  const autocompletePromise = BrowserTestUtils.waitForEvent(
    searchBar,
    "autocomplete"
  );
  const searchPromise = BrowserTestUtils.waitForEvent(searchBar, "search");
  searchBar.shadowRoot.querySelector("#search-button").click();
  const autocompleteEvent = await autocompletePromise;
  const searchEvent = await searchPromise;
  await waitForRender();

  Assert.lessOrEqual(
    autocompleteEvent.timeStamp,
    searchEvent.timeStamp,
    "autocomplete event happened before search event"
  );
  ok(searchEvent.defaultPrevented);

  is(input.value, "Lorem ipsum");

  input.value = "";

  await ensureNoMoreEvents();
});

add_task(async function test_placeholderVisibility() {
  const placeholder = searchBar.shadowRoot.querySelector("div");
  const input = searchBar.shadowRoot.querySelector("input");

  input.value = "";
  await waitForRender();
  ok(
    BrowserTestUtils.isVisible(placeholder),
    "Placeholder is visible initially"
  );

  input.value = "some input";
  await waitForRender();
  ok(
    BrowserTestUtils.isHidden(placeholder),
    "Placeholder is hidden after text is entered"
  );

  input.value = "";
  await waitForRender();
  ok(
    BrowserTestUtils.isVisible(placeholder),
    "Placeholder is visible again after input is cleared"
  );
});

add_task(async function test_placeholderFallback() {
  const placeholderSpan = searchBar.querySelector("span");
  placeholderSpan.remove();

  const shadowedPlaceholder = searchBar.shadowRoot.querySelector("div");
  const placeholder = searchBar.getAttribute("placeholder");

  is(
    shadowedPlaceholder.textContent,
    placeholder,
    "Falls back to attribute value if no placeholder slot contents provided"
  );

  searchBar.setAttribute("placeholder", "Foo bar");
  is(
    shadowedPlaceholder.textContent,
    "Foo bar",
    "Placeholder contents get updated with placeholder attribute"
  );

  searchBar.prepend(placeholderSpan);
  searchBar.setAttribute("placeholder", placeholder);
});

add_task(async function test_reset() {
  const input = searchBar.shadowRoot.querySelector("input");
  const placeholder = searchBar.shadowRoot.querySelector("div");
  const clearButton = searchBar.shadowRoot.querySelector("#clear-button");
  input.value = "Lorem ipsum";

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  searchBar.reset();
  await eventPromise;

  is(input.value, "", "Input empty after reset");
  await waitForRender();
  ok(BrowserTestUtils.isVisible(placeholder), "Placeholder visible");
  ok(BrowserTestUtils.isHidden(clearButton), "Clear button hidden");

  // Test resetting with no value. Nothing should happen.

  const failListener = () => {
    ok(false, "Should not have seen an autocomplete event");
  };
  searchBar.addEventListener("autocomplete", failListener, { once: true });
  searchBar.reset();
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  searchBar.removeEventListener("autocomplete", failListener);

  ok(BrowserTestUtils.isVisible(placeholder), "Placeholder visible");
  ok(BrowserTestUtils.isHidden(clearButton), "Clear button hidden");
});

add_task(async function test_disabled() {
  const input = searchBar.shadowRoot.querySelector("input");
  const button = searchBar.shadowRoot.querySelector("#search-button");

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

add_task(async function test_clearButtonVisibility() {
  const button = searchBar.shadowRoot.querySelector("#clear-button");

  ok(BrowserTestUtils.isHidden(button), "Clear Button is hidden initially");

  searchBar.focus();
  const event = await typeAndWaitForAutocomplete("T");
  is(event.detail, "T", "Autocomplete for T");
  ok(
    BrowserTestUtils.isVisible(button),
    "Clear Button is visible after text is entered"
  );

  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  await BrowserTestUtils.synthesizeKey("KEY_Escape", {}, browser);
  await eventPromise;
  ok(
    BrowserTestUtils.isHidden(button),
    "Clear Button is hidden after input is cleared"
  );
});

add_task(async function test_clearButton() {
  const input = searchBar.shadowRoot.querySelector("input");
  const button = searchBar.shadowRoot.querySelector("#clear-button");
  searchBar.focus();

  const event = await typeAndWaitForAutocomplete("T");
  is(event.detail, "T", "Autocomplete for T");
  ok(
    BrowserTestUtils.isVisible(button),
    "Clear Button is visible after text is entered"
  );
  await waitForRender();

  await EventUtils.synthesizeMouseAtCenter(button, {}, browser.contentWindow);
  await waitForRender();

  is(input.value, "", "Input was cleared");
  ok(
    BrowserTestUtils.isHidden(button),
    "Clear Button is hidden after text is cleared"
  );
  is(
    browser.contentWindow.document.activeElement,
    searchBar,
    "Search bar is focused after input has been reset"
  );
  is(searchBar.shadowRoot.activeElement, input, "Should focus input");
});

add_task(async function test_overrideSearchTerm_noFocus() {
  const input = searchBar.shadowRoot.querySelector("input");
  const value = "lorem ipsum";
  input.blur();
  searchBar.blur();
  isnot(
    browser.contentWindow.document.activeElement,
    searchBar,
    "Search bar should not be focused"
  );
  isnot(searchBar.shadowRoot.activeElement, input, "Should not focus input");

  let autocomplete = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  let result = searchBar.overrideSearchTerm(value);
  ok(result, "Should confirm setting input to value");
  let event = await autocomplete;
  is(event.detail, value, "Autocomplete should be sent for overridden value");
  is(input.value, value, "Input contents should be set to overridden value");

  const failListener = () => {
    ok(false, "Should not have seen an autocomplete event");
  };
  searchBar.addEventListener("autocomplete", failListener, { once: true });
  result = searchBar.overrideSearchTerm(value);
  ok(result, "Should confirm the value");
  is(input.value, value, "Should still have value in input");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  searchBar.removeEventListener("autocomplete", failListener);

  autocomplete = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  result = searchBar.overrideSearchTerm("");
  ok(result, "Should accept new value");
  event = await autocomplete;
  is(event.detail, "", "Should send autocomplete for empty value");
  is(input.value, "", "Should have emptied the input");
});

add_task(async function test_overrideSearchTerm_withFocus() {
  const input = searchBar.shadowRoot.querySelector("input");
  const value = "lorem ipsum";
  const failListener = () => {
    ok(false, "Should not have seen an autocomplete event");
  };
  searchBar.focus();
  await typeAndWaitForAutocomplete("T");
  searchBar.addEventListener("autocomplete", failListener);

  let result = searchBar.overrideSearchTerm("foo bar");
  ok(!result, "Should have refused to override value");
  is(input.value, "T", "Should not have modified input value");

  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  searchBar.removeEventListener("autocomplete", failListener);
  searchBar.reset();
  searchBar.focus();

  const autocomplete = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");
  result = searchBar.overrideSearchTerm(value);
  ok(result, "Should allow overriding if the search bar is empty");
  const event = await autocomplete;
  is(
    event.detail,
    value,
    "Should send autocomplete event for overridden value"
  );
  is(input.value, value, "Should apply value to input");

  searchBar.reset();
});
