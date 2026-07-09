/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subview;
let graphCard;
let ewsCard;
let authenticationSelect;
let defaultOauthInput;
let oauthOptionsWrapperElement;
let customOauthWrapperElement;
let oauthTenantInput;
let oauthApplicationInput;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailExchangeType.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-exchange-type"
  );
  graphCard = subview.querySelector(
    'account-hub-radio-card-large[value="graph"]'
  );
  ewsCard = subview.querySelector('account-hub-radio-card-large[value="ews"]');
  authenticationSelect = subview.querySelector("#exchangeTypeAuthentication");
  defaultOauthInput = subview.querySelector("#exchangeTypeDefaultOauth");
  oauthOptionsWrapperElement = subview.querySelector(
    "#exchangeTypeOauthOptions"
  );
  customOauthWrapperElement = subview.querySelector("#exchangeTypeOauthCustom");
  oauthTenantInput = subview.querySelector("#exchangeTypeOauthTenant");
  oauthApplicationInput = subview.querySelector("#exchangeTypeOauthApp");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

/**
 * Returns the html option element with the given id.
 *
 * @param {string} id The id of the option element to return.
 *
 * @returns {HTMLOptionElement}
 */
function getAuthenticationOption(id) {
  return authenticationSelect.querySelector(`#${id}`);
}

/**
 * Select a given value from the select element and dispatch change event.
 *
 * @param {string} value The value to select.
 */
function changeAuthenticationMethod(value) {
  authenticationSelect.value = value;
  authenticationSelect.select.dispatchEvent(
    new Event("change", { bubbles: true })
  );
}

/**
 * Select an authentication method by opening and activating the native select
 * popup item that matches the visible option.
 *
 * @param {string} optionId The id of the option to select.
 */
async function selectAuthenticationMethod(optionId) {
  const option = getAuthenticationOption(optionId);
  Assert.ok(!option.hidden, `${optionId} should be shown for selection`);

  await TestUtils.waitForCondition(
    () => !authenticationSelect.select.querySelector(`#${optionId}`)?.hidden,
    `${optionId} should be reflected as shown in the native select`
  );
  const nativeOption = authenticationSelect.select.querySelector(
    `#${optionId}`
  );

  await SimpleTest.promiseFocus(browser.contentWindow);
  const popupPromise = BrowserTestUtils.waitForSelectPopupShown(window);
  EventUtils.synthesizeMouseAtCenter(
    authenticationSelect,
    {},
    browser.contentWindow
  );

  const popup = await popupPromise;
  const popupItems = popup.querySelectorAll("menuitem");
  const optionIndex = Array.from(authenticationSelect.select.options).indexOf(
    nativeOption
  );
  const popupItem = popupItems[optionIndex];

  Assert.greaterOrEqual(optionIndex, 0, `${optionId} should be selectable`);
  Assert.ok(popupItem, `${optionId} should be available in the select popup`);
  if (!popupItem) {
    popup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
    throw new Error(`${optionId} was missing from the select popup`);
  }

  Assert.ok(
    !popupItem.hidden,
    `${optionId} should be selectable in the select popup`
  );
  if (popupItem.hidden) {
    popup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
    throw new Error(`${optionId} was hidden in the select popup`);
  }

  popup.activateItem(popupItem);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
}

/**
 * Selects an account type card and dispatches a change event from it.
 *
 * @param {HTMLElement} card The account type card to select.
 */
function changeAccountType(card) {
  card.checked = true;
  card.dispatchEvent(new Event("change", { bubbles: true }));
}

function assertAriaControlState(
  control,
  controlledElements,
  expanded,
  message
) {
  Assert.deepEqual(
    control.ariaControlsElements,
    controlledElements,
    `${message} should control the expected element`
  );
  Assert.equal(
    control.ariaExpanded,
    String(expanded),
    `${message} should report the expected expanded state`
  );
}

add_task(function test_titleHasFluentId() {
  const header = subview.shadowRoot.querySelector("account-hub-header");
  const titleFluentId = header.l10n.getAttributes(
    header.querySelector("#title")
  ).id;

  Assert.equal(
    titleFluentId,
    "account-hub-exchange-type-title",
    "Exchange type title should use the expected fluent ID"
  );
});

add_task(function test_graphOnlyShowsOauthAuthentication() {
  changeAccountType(graphCard);
  Assert.ok(graphCard.checked, "Graph should be selected");

  Assert.equal(
    authenticationSelect.value,
    "10",
    "OAuth2 should be selected by default for Graph"
  );
  Assert.ok(
    getAuthenticationOption("incomingAuthMethodCleartext").hidden,
    "Normal password should be hidden for Graph"
  );
  Assert.ok(
    getAuthenticationOption("incomingAuthMethodNtlm").hidden,
    "NTLM should be hidden for Graph"
  );
  Assert.ok(
    !getAuthenticationOption("incomingAuthMethodOAuth2").hidden,
    "OAuth2 should be visible for Graph"
  );
  Assert.ok(
    defaultOauthInput.checked,
    "Default OAuth checkbox should be checked"
  );
  assertAriaControlState(
    authenticationSelect.select,
    [oauthOptionsWrapperElement],
    true,
    "Authentication select"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(oauthOptionsWrapperElement),
    "OAuth options should be shown for Graph"
  );
  assertAriaControlState(
    defaultOauthInput.querySelector("input"),
    [oauthTenantInput, oauthApplicationInput],
    false,
    "Default OAuth checkbox"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(customOauthWrapperElement),
    "Custom OAuth options should be hidden when default OAuth is checked"
  );
  Assert.ok(
    !customOauthWrapperElement.querySelector("input").required,
    "Custom OAuth fields should not be required when default OAuth is checked"
  );
});

add_task(function test_ewsShowsAllAuthenticationOptions() {
  changeAccountType(ewsCard);

  Assert.ok(ewsCard.checked, "EWS should be selected");
  Assert.ok(
    !getAuthenticationOption("incomingAuthMethodCleartext").hidden,
    "Normal password should be visible for EWS"
  );
  Assert.ok(
    !getAuthenticationOption("incomingAuthMethodNtlm").hidden,
    "NTLM should be visible for EWS"
  );
  Assert.ok(
    !getAuthenticationOption("incomingAuthMethodOAuth2").hidden,
    "OAuth2 should be visible for EWS"
  );
});

add_task(async function test_passwordAuthenticationHidesDefaultOauth() {
  const hiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    oauthOptionsWrapperElement
  );
  changeAuthenticationMethod("3");
  await hiddenPromise;

  Assert.equal(
    authenticationSelect.value,
    "3",
    "Normal password should be selected"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(oauthOptionsWrapperElement),
    "OAuth options should be hidden for normal password authentication"
  );
  assertAriaControlState(
    authenticationSelect.select,
    [oauthOptionsWrapperElement],
    false,
    "Authentication select"
  );
  assertAriaControlState(
    defaultOauthInput.querySelector("input"),
    [oauthTenantInput, oauthApplicationInput],
    false,
    "Default OAuth checkbox"
  );
  Assert.ok(
    !customOauthWrapperElement.querySelector("input").required,
    "Custom OAuth fields should not be required while hidden"
  );
});

add_task(async function test_graphForcesOauthAuthentication() {
  const oauthOptionsVisiblePromise = BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    oauthOptionsWrapperElement
  );

  changeAccountType(graphCard);
  await oauthOptionsVisiblePromise;

  Assert.ok(graphCard.checked, "Graph should be selected");
  Assert.equal(
    authenticationSelect.value,
    "10",
    "Switching to Graph should select OAuth2"
  );
  Assert.ok(
    getAuthenticationOption("incomingAuthMethodCleartext").hidden,
    "Normal password should be hidden for Graph"
  );
  Assert.ok(
    getAuthenticationOption("incomingAuthMethodNtlm").hidden,
    "NTLM should be hidden for Graph"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(oauthOptionsWrapperElement),
    "OAuth options should be shown for OAuth2 authentication"
  );
  assertAriaControlState(
    authenticationSelect.select,
    [oauthOptionsWrapperElement],
    true,
    "Authentication select"
  );
});

add_task(async function test_uncheckingDefaultOauthShowsCustomOptions() {
  const visiblePromise = BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    customOauthWrapperElement
  );
  defaultOauthInput.querySelector("input").click();
  await visiblePromise;

  Assert.ok(
    !defaultOauthInput.checked,
    "Default OAuth checkbox should be unchecked"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(customOauthWrapperElement),
    "Custom OAuth options should show when default OAuth is unchecked"
  );
  assertAriaControlState(
    defaultOauthInput.querySelector("input"),
    [oauthTenantInput, oauthApplicationInput],
    true,
    "Default OAuth checkbox"
  );
  Assert.ok(
    customOauthWrapperElement.querySelector("input").required,
    "Custom OAuth fields should be required when custom OAuth is shown"
  );
});

add_task(async function test_ewsPasswordStillHidesDefaultOauth() {
  changeAccountType(graphCard);
  changeAccountType(ewsCard);
  const hiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    oauthOptionsWrapperElement
  );
  await selectAuthenticationMethod("incomingAuthMethodCleartext");
  await hiddenPromise;

  Assert.equal(
    authenticationSelect.value,
    "3",
    "Normal password should be selectable for EWS"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(oauthOptionsWrapperElement),
    "OAuth options should stay hidden for normal password authentication"
  );
  assertAriaControlState(
    authenticationSelect.select,
    [oauthOptionsWrapperElement],
    false,
    "Authentication select"
  );
  assertAriaControlState(
    defaultOauthInput.querySelector("input"),
    [oauthTenantInput, oauthApplicationInput],
    false,
    "Default OAuth checkbox"
  );
});
