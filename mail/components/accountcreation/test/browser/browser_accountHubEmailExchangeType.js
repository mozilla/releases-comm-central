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
 * Selects an account type card and dispatches a change event from it.
 *
 * @param {HTMLElement} card The account type card to select.
 */
function changeAccountType(card) {
  card.checked = true;
  card.dispatchEvent(new Event("change", { bubbles: true }));
}

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

add_task(function test_graphForcesOauthAuthentication() {
  changeAuthenticationMethod("3");
  Assert.equal(
    authenticationSelect.value,
    "3",
    "Normal password should be selectable for EWS"
  );

  changeAccountType(graphCard);

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
});
