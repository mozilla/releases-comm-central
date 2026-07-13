/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

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
let advancedConfigButton;

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
  advancedConfigButton = subview.querySelector(
    "#advancedConfigurationExchange"
  );

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

function setUsername(value) {
  subview.querySelector("#exchangeTypeUsername").value = value;
}

function setDefaultOauth(checked) {
  defaultOauthInput.checked = checked;
  defaultOauthInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCustomOauthDetails(tenant, clientId) {
  setDefaultOauth(false);
  subview.querySelector("#exchangeTypeOauthTenant").value = tenant;
  subview.querySelector("#exchangeTypeOauthApp").value = clientId;
}

function createIncomingConfig(type, auth, username, exchangeURL) {
  const config = new AccountConfig();
  config.incoming.type = type;
  config.incoming.auth = auth;
  config.incoming.username = username;
  config.incoming.exchangeURL = exchangeURL;
  return config;
}

function subtest_assertRecommendedCard(recommendedCard, otherCard, message) {
  const recommendedBadge = recommendedCard.querySelector(".badge");
  const recommendedDescription = recommendedCard.querySelector(
    ".recommended-description"
  );
  const recommendedOtherTags = recommendedCard.querySelectorAll(
    '[slot="tag"]:not(.badge)'
  );
  const otherBadge = otherCard.querySelector(".badge");
  const otherDescription = otherCard.querySelector(".recommended-description");
  const otherTags = otherCard.querySelectorAll('[slot="tag"]:not(.badge)');

  Assert.ok(
    BrowserTestUtils.isVisible(recommendedBadge),
    `${message} should show the recommended badge`
  );
  Assert.ok(
    BrowserTestUtils.isVisible(recommendedDescription),
    `${message} should show the recommended description`
  );
  Assert.ok(
    Array.from(recommendedOtherTags).every(BrowserTestUtils.isHidden),
    `${message} should hide other tag slot content on the recommended card`
  );

  Assert.ok(
    BrowserTestUtils.isHidden(otherBadge),
    `${message} should hide the other card's recommended badge`
  );
  Assert.ok(
    BrowserTestUtils.isHidden(otherDescription),
    `${message} should hide the other card's recommended description`
  );
  Assert.ok(
    Array.from(otherTags).every(BrowserTestUtils.isVisible),
    `${message} should show other tag slot content on the non-recommended card`
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

add_task(async function test_advancedConfigurationDispatchesEvent() {
  const advancedConfigEvent = BrowserTestUtils.waitForEvent(
    subview,
    "advanced-config"
  );

  advancedConfigButton.click();

  const event = await advancedConfigEvent;
  Assert.equal(
    event.target,
    subview,
    "Advanced configuration should be requested from the Exchange type subview"
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

add_task(function test_setStatePrefillsAutodiscoveredExchangeConfig() {
  const config = createIncomingConfig(
    "exchange",
    Ci.nsMsgAuthMethod.passwordCleartext,
    "autodiscovered@example.com",
    "https://outlook.office365.com/EWS/Exchange.asmx"
  );

  subview.setState(config);

  Assert.ok(
    ewsCard.checked,
    "An autodiscovered Exchange config should preselect EWS"
  );
  Assert.equal(
    subview.querySelector("#exchangeTypeUsername").value,
    "autodiscovered@example.com",
    "The username should be prefilled from the discovered config"
  );
  Assert.equal(
    authenticationSelect.value,
    String(Ci.nsMsgAuthMethod.passwordCleartext),
    "The authentication method should be prefilled from the discovered config"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(oauthOptionsWrapperElement),
    "OAuth defaults should stay hidden for a discovered password auth config"
  );
});

add_task(function test_setStatePrefillsDiscoveredGraphConfig() {
  const config = createIncomingConfig(
    "graph",
    Ci.nsMsgAuthMethod.OAuth2,
    "graph-user@example.com",
    "https://graph.microsoft.com/v1.0"
  );

  subview.setState(config);

  Assert.ok(graphCard.checked, "A Graph config should preselect Graph");
  Assert.equal(
    subview.querySelector("#exchangeTypeUsername").value,
    "graph-user@example.com",
    "The username should be prefilled from the Graph config"
  );
  Assert.equal(
    authenticationSelect.value,
    String(Ci.nsMsgAuthMethod.OAuth2),
    "Graph should prefill OAuth2 authentication"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(oauthOptionsWrapperElement),
    "OAuth defaults should be visible for a discovered OAuth2 config"
  );
});

add_task(function test_setStateRecommendsGraphForGraphURL() {
  const config = new AccountConfig();
  config.incoming.exchangeURL = "https://graph.microsoft.com/v1.0";

  subview.setState(config);

  Assert.ok(graphCard.checked, "Graph should be selected for a Graph URL");
  subtest_assertRecommendedCard(graphCard, ewsCard, "A Graph URL");
});

add_task(function test_setStateRecommendsEwsForNonGraphURL() {
  const config = new AccountConfig();
  config.incoming.exchangeURL =
    "https://outlook.office365.com/EWS/Exchange.asmx";

  subview.setState(config);

  Assert.ok(ewsCard.checked, "EWS should be selected for a non-Graph URL");
  subtest_assertRecommendedCard(ewsCard, graphCard, "A non-Graph URL");
});

add_task(function test_setStateKeepsStoredTypeOverRecommendation() {
  const config = createIncomingConfig(
    "ews",
    Ci.nsMsgAuthMethod.OAuth2,
    "ews-user@example.com",
    "https://graph.microsoft.com/"
  );

  subview.setState(config);

  Assert.ok(
    ewsCard.checked,
    "The stored account type should remain selected over the recommendation"
  );
  subtest_assertRecommendedCard(
    graphCard,
    ewsCard,
    "A Graph URL with stored EWS"
  );
});

add_task(function test_captureGraphState() {
  const settingsConfig = new AccountConfig();
  settingsConfig.incoming.exchangeURL = "https://graph.microsoft.com/v1.0";
  subview.setState(settingsConfig);

  changeAccountType(graphCard);
  setUsername("test@example.com");
  setDefaultOauth(true);

  const config = subview.captureState();

  Assert.ok(
    config instanceof AccountConfig,
    "Capture state should return an AccountConfig"
  );
  Assert.equal(
    config.source,
    AccountConfig.kSourceUser,
    "Exchange type state should be user-entered"
  );
  Assert.equal(config.incoming.type, "graph", "Graph should be captured");
  Assert.equal(
    config.incoming.exchangeURL,
    settingsConfig.incoming.exchangeURL,
    "Graph endpoint should match what config passed in"
  );
  Assert.equal(
    config.incoming.hostname,
    "graph.microsoft.com",
    "Graph hostname should be captured from the endpoint"
  );
  Assert.equal(
    config.incoming.auth,
    Ci.nsMsgAuthMethod.OAuth2,
    "Graph should capture OAuth2 authentication"
  );
  Assert.equal(
    config.incoming.username,
    "test@example.com",
    "Username should be captured"
  );
  Assert.equal(
    config.incoming.oauthSettings,
    null,
    "Default OAuth should not capture custom OAuth settings"
  );
});

add_task(function test_captureCustomOauthState() {
  changeAccountType(graphCard);
  setUsername("test@example.com");
  setCustomOauthDetails("test-tenant", "test-client-id");

  const config = subview.captureState();

  Assert.deepEqual(
    config.incoming.oauthSettings,
    {
      useCustomDetails: true,
      tenant: "test-tenant",
      clientId: "test-client-id",
      authorizationEndpoint:
        "https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize",
      tokenEndpoint:
        "https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token",
    },
    "Custom OAuth details should be captured"
  );
});

add_task(function test_captureEwsState() {
  const settingsConfig = new AccountConfig();
  settingsConfig.incoming.exchangeURL =
    "https://outlook.office365.com/EWS/Exchange.asmx";
  subview.setState(settingsConfig);

  changeAccountType(ewsCard);
  setUsername("test@example.com");
  setDefaultOauth(true);
  changeAuthenticationMethod(String(Ci.nsMsgAuthMethod.passwordCleartext));

  const config = subview.captureState();

  Assert.equal(config.incoming.type, "ews", "EWS should be captured");
  Assert.equal(
    config.incoming.exchangeURL,
    settingsConfig.incoming.exchangeURL,
    "EWS endpoint should match what config passed in"
  );
  Assert.equal(
    config.incoming.hostname,
    "outlook.office365.com",
    "EWS hostname should be captured from the endpoint"
  );
  Assert.equal(
    config.incoming.auth,
    Ci.nsMsgAuthMethod.passwordCleartext,
    "EWS should capture the selected authentication method"
  );
  Assert.equal(
    config.incoming.username,
    "test@example.com",
    "Username should be captured"
  );
});
