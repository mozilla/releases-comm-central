/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser, cards;

add_setup(async () => {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubRadioCardLarge.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  cards = browser.contentDocument.querySelectorAll(
    "account-hub-radio-card-large"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

/**
 * Check the selection state of all the radio cards. This means checking the
 * tabindex and aria-checked attribute as well as the checked property.
 *
 * @param {string} selectedCardValue - The value of the card that should be
 *   checked.
 */
function checkSelectionState(selectedCardValue) {
  info(`Expect card ${selectedCardValue} to be selected`);
  for (const card of cards) {
    if (card.value == selectedCardValue) {
      Assert.equal(
        card.tabIndex,
        0,
        `Card ${selectedCardValue} should be focusable`
      );
      Assert.equal(
        card.ariaChecked,
        "true",
        `Card ${selectedCardValue} should be checked`
      );
      Assert.ok(
        card.checked,
        `Card ${selectedCardValue} should represent itself as checked`
      );
    } else {
      Assert.equal(
        card.tabIndex,
        -1,
        `Card ${card.value} should not be focusable`
      );
      Assert.equal(
        card.ariaChecked,
        "false",
        `Card ${card.value} should be unchecked`
      );
      Assert.ok(
        !card.checked,
        `Card ${card.value} should represent itself as unchecked`
      );
    }
  }
}

function testKeyboardCycle(key, goForward = true) {
  info(
    `Testing keyboard radio cycle for key ${key} (${goForward ? "forward" : "backward"})`
  );
  const expectedCards = goForward
    ? cards
    : [cards[0], ...Array.from(cards).slice(1).reverse()];
  expectedCards[0].focus();
  for (const card of expectedCards) {
    checkSelectionState(card.value);
    EventUtils.synthesizeKey(key, {}, browser.contentWindow);
  }
  checkSelectionState(expectedCards[0].value);
}

add_task(function test_initialization() {
  for (const card of cards) {
    Assert.equal(
      card.role,
      "radio",
      `Card ${card.value} should give itself the radio role`
    );
    Assert.equal(
      card.value,
      card.getAttribute("value"),
      "Should hold value attribute value in property"
    );
  }
  checkSelectionState("first");
});

add_task(function test_radioBehaviorMouse() {
  EventUtils.synthesizeMouseAtCenter(cards[1], {}, browser.contentWindow);

  checkSelectionState("second");

  EventUtils.synthesizeMouseAtCenter(cards[2], {}, browser.contentWindow);

  checkSelectionState("last");

  EventUtils.synthesizeMouseAtCenter(cards[0], {}, browser.contentWindow);

  checkSelectionState("first");
});

add_task(function test_radioBehaviorKeyboard() {
  testKeyboardCycle("KEY_ArrowRight");
  testKeyboardCycle("KEY_ArrowDown");
  testKeyboardCycle("KEY_ArrowLeft", false);
  testKeyboardCycle("KEY_ArrowUp", false);
});

add_task(function test_checkedProperty() {
  // Not testing the unchecking/radio group behavior, as that is well covered
  // with the interaction tests. This test focuses on the interface of the
  // checked property.
  const card = cards[0];
  card.checked = true;

  checkSelectionState(card.value);

  card.checked = false;

  Assert.ok(!card.checked, "Card should indicate it is unchecked");
  Assert.equal(card.ariaChecked, "false", "Card should be unchecked");
  Assert.equal(card.tabIndex, -1, "Card should not be focusable");

  card.checked = true;

  checkSelectionState(card.value);
});

add_task(function test_keyboardSelect() {
  const card = cards[0];
  card.checked = false;
  card.focus();

  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);

  Assert.ok(card.checked);
});
