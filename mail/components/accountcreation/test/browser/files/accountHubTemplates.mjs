/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import accountHubAddressBookAccountSelectTemplate from "chrome://messenger/content/accountcreation/templates/address-book-account-select.html" with { type: "text" };
import accountHubAddressBookLdapAccountFormTemplate from "chrome://messenger/content/accountcreation/templates/address-book-ldap-account-form.html" with { type: "text" };
import accountHubAddressBookLocalFormTemplate from "chrome://messenger/content/accountcreation/templates/address-book-local-form.html" with { type: "text" };
import accountHubAddressBookOptionSelectTemplate from "chrome://messenger/content/accountcreation/templates/address-book-option-select.html" with { type: "text" };
import accountHubAddressBookRemoteAccountFormTemplate from "chrome://messenger/content/accountcreation/templates/address-book-remote-account-form.html" with { type: "text" };
import accountHubAddressBookSetupTemplate from "chrome://messenger/content/accountcreation/templates/address-book.html" with { type: "text" };
import accountHubAddressBookSyncTemplate from "chrome://messenger/content/accountcreation/templates/address-book-sync.html" with { type: "text" };
import accountHubCheckboxTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-checkbox.html" with { type: "text" };
import accountHubContainerTemplate from "chrome://messenger/content/accountcreation/templates/container.html" with { type: "text" };
import accountHubEmailAddedSuccessTemplate from "chrome://messenger/content/accountcreation/templates/email-added-success.html" with { type: "text" };
import accountHubEmailAuthenticationFormTemplate from "chrome://messenger/content/accountcreation/templates/email-authentication-form.html" with { type: "text" };
import accountHubEmailAutoFormTemplate from "chrome://messenger/content/accountcreation/templates/email-auto-form.html" with { type: "text" };
import accountHubEmailConfigFoundTemplate from "chrome://messenger/content/accountcreation/templates/email-config-found.html" with { type: "text" };
import accountHubEmailCredentialsConfirmationTemplate from "chrome://messenger/content/accountcreation/templates/email-credentials-confirmation.html" with { type: "text" };
import accountHubEmailExchangeSettingsTemplate from "chrome://messenger/content/accountcreation/templates/email-exchange-settings.html" with { type: "text" };
import accountHubEmailExchangeType from "chrome://messenger/content/accountcreation/templates/email-exchange-type.html" with { type: "text" };
import accountHubEmailIncomingFormTemplate from "chrome://messenger/content/accountcreation/templates/email-manual-incoming-form.html" with { type: "text" };
import accountHubEmailManualConfigFormTemplate from "chrome://messenger/content/accountcreation/templates/email-manual-config-form.html" with { type: "text" };
import accountHubEmailOutgoingFormTemplate from "chrome://messenger/content/accountcreation/templates/email-manual-outgoing-form.html" with { type: "text" };
import accountHubEmailPasswordFormTemplate from "chrome://messenger/content/accountcreation/templates/email-password-form.html" with { type: "text" };
import accountHubEmailProtocolSelectFormTemplate from "chrome://messenger/content/accountcreation/templates/email-protocol-select-form.html" with { type: "text" };
import accountHubEmailSetupTemplate from "chrome://messenger/content/accountcreation/templates/email.html" with { type: "text" };
import accountHubEmailSyncAccountsFormTemplate from "chrome://messenger/content/accountcreation/templates/email-sync-accounts-form.html" with { type: "text" };
import accountHubFooterTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-footer.html" with { type: "text" };
import accountHubHeaderTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-header.html" with { type: "text" };
import accountHubInputTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-input.html" with { type: "text" };
import accountHubRadioCardLargeTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-radio-card-large.html" with { type: "text" };
import accountHubSelectTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-select.html" with { type: "text" };
import accountHubStartTemplate from "chrome://messenger/content/accountcreation/templates/start.html" with { type: "text" };
import accountHubStepTemplate from "chrome://messenger/content/accountcreation/templates/account-hub-step.html" with { type: "text" };

/** Packaged template sources keyed by filename. */
export const templates = {
  "address-book-account-select.html":
    accountHubAddressBookAccountSelectTemplate,
  "address-book-ldap-account-form.html":
    accountHubAddressBookLdapAccountFormTemplate,
  "address-book-local-form.html": accountHubAddressBookLocalFormTemplate,
  "address-book-option-select.html": accountHubAddressBookOptionSelectTemplate,
  "address-book-remote-account-form.html":
    accountHubAddressBookRemoteAccountFormTemplate,
  "address-book.html": accountHubAddressBookSetupTemplate,
  "address-book-sync.html": accountHubAddressBookSyncTemplate,
  "account-hub-checkbox.html": accountHubCheckboxTemplate,
  "container.html": accountHubContainerTemplate,
  "email-added-success.html": accountHubEmailAddedSuccessTemplate,
  "email-authentication-form.html": accountHubEmailAuthenticationFormTemplate,
  "email-auto-form.html": accountHubEmailAutoFormTemplate,
  "email-config-found.html": accountHubEmailConfigFoundTemplate,
  "email-credentials-confirmation.html":
    accountHubEmailCredentialsConfirmationTemplate,
  "email-exchange-settings.html": accountHubEmailExchangeSettingsTemplate,
  "email-exchange-type.html": accountHubEmailExchangeType,
  "email-manual-incoming-form.html": accountHubEmailIncomingFormTemplate,
  "email-manual-config-form.html": accountHubEmailManualConfigFormTemplate,
  "email-manual-outgoing-form.html": accountHubEmailOutgoingFormTemplate,
  "email-password-form.html": accountHubEmailPasswordFormTemplate,
  "email-protocol-select-form.html": accountHubEmailProtocolSelectFormTemplate,
  "email.html": accountHubEmailSetupTemplate,
  "email-sync-accounts-form.html": accountHubEmailSyncAccountsFormTemplate,
  "account-hub-footer.html": accountHubFooterTemplate,
  "account-hub-header.html": accountHubHeaderTemplate,
  "account-hub-input.html": accountHubInputTemplate,
  "account-hub-radio-card-large.html": accountHubRadioCardLargeTemplate,
  "account-hub-select.html": accountHubSelectTemplate,
  "start.html": accountHubStartTemplate,
  "account-hub-step.html": accountHubStepTemplate,
};
