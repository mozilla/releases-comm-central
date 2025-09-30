# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Account Hub
### Account hub is where user can setup new accounts in Thunderbird.

## Header

account-hub-brand = { -brand-full-name }

account-hub-welcome-line = Welcome to <span data-l10n-name="brand-name">{ -brand-full-name }</span>

account-hub-title = Account Hub

## Footer

account-hub-release-notes = Release notes

account-hub-support = Support

account-hub-donate = Donate

## Initial setup page

account-hub-email-setup-button = Email Account
    .title = Set up an email account

account-hub-calendar-setup-button = Calendar
    .title = Set up a local or remote calendar

account-hub-address-book-setup-button = Address Book
    .title = Set up a local or remote address book

account-hub-chat-setup-button = Chat
    .title = Set up a chat account

account-hub-feed-setup-button = RSS feed
    .title = Set up an RSS feed account

account-hub-newsgroup-setup-button = Newsgroup
    .title = Set up a newsgroup account

account-hub-import-setup-button = Import
    .title = Import a backed up profile

# Note: "Sync" represents the Firefox Sync product so it shouldn't be translated.
account-hub-sync-button = Sign in to Sync…

## Email page

account-hub-add-email-title = Add Your Account

account-hub-manually-configure-email-title = Set Up Account Configuration

account-hub-email-cancel-button = Cancel

account-hub-email-stop-button = Stop

account-hub-email-back-button = Back

account-hub-email-retest-button = Retest

account-hub-email-finish-button = Finish

account-hub-email-manually-configure-button = Configure Manually

account-hub-email-continue-button = Continue

account-hub-email-confirm-button = Confirm

account-hub-result-incoming-server-legend = Incoming server
    .title = Incoming server

account-hub-result-outgoing-server-legend = Outgoing server
    .title = Outgoing server

account-hub-protocol-label = Protocol

account-hub-result-hostname-label = Hostname
    .title = Hostname

account-hub-result-socket-type-label = Connection security

account-hub-port-label = Port
    .title = Set the port number to 0 for autodetection

account-hub-auto-description = { -brand-short-name } will attempt to auto-detect fields that are left blank.

account-hub-ssl-label = Connection security

## Incoming/Outgoing authentication method options

account-hub-ssl-autodetect-option =
    .label = Autodetect

account-hub-ssl-cleartext-password-option =
    .label = Normal password

account-hub-ssl-encrypted-password-option =
    .label = Encrypted password

## Incoming/Outgoing connection security options

account-hub-ssl-noencryption-option =
    .label = None

account-hub-auth-no-authentication-option =
    .label = No Authentication

account-hub-auth-label = Authentication method

account-hub-result-username-label = Username
    .title = Username

account-hub-name-label = Full name
    .accesskey = n

account-hub-adding-account-title = Adding Account

account-hub-adding-account-subheader = Re-testing account configuration settings

account-hub-lookup-email-configuration-title = Looking up configuration

account-hub-lookup-email-configuration-subheader = Trying common server names…

account-hub-email-account-added-title = Account successfully added

account-hub-find-account-settings-failed = { -brand-short-name } failed to find the settings for your email account.

account-hub-notification-show-more = Show more

account-hub-notification-show-less = Show less

account-hub-email-setup-header = Add your email address

account-hub-email-setup-incoming = Incoming server settings

account-hub-email-setup-outgoing = Outgoing server settings

account-hub-email-config-found = Choose your email account type

account-hub-email-enter-password = Enter your email account password

account-hub-email-sync-accounts = Sync your calendars and address books

account-hub-test-configuration = Test

account-hub-add-new-email = Add another email

account-hub-result-imap-description = Keep your folders and emails synced on your server

account-hub-result-pop-description = Keep your folders and emails on your computer

account-hub-result-ews-shortname = Exchange

account-hub-result-ews-description = Use Microsoft Exchange Web Services to sync your folders and emails

account-hub-result-exchange-description = Sync folders & emails with Exchange or Office 365

account-hub-result-ews-text = Server

account-hub-result-recommended-label = Recommended

account-hub-result-addon-label = Requires Add-on

account-hub-edit-configuration = Edit configuration

account-hub-config-success = Configuration found in Mozilla ISPDB

account-hub-password-info = Your credentials will only be stored locally on your computer

account-hub-creating-account = Creating account…

account-hub-sync-accounts-found = { -brand-short-name } found some connected services

account-hub-sync-accounts-not-found = { -brand-short-name } was unable to find connected services

account-hub-sync-accounts-failure = { -brand-short-name } was unable to connect the selected services

account-hub-email-added-success = Email account connected successfully

account-hub-config-test-success = Configuration settings valid

account-hub-select-all = Select all

account-hub-deselect-all = Deselect all

# $count (Number) - The number of sync accounts selected.
account-hub-sync-accounts-selected =
    { $count ->
        [one] { $count } selected
        *[other] { $count } selected
    }

account-hub-no-address-books = No address books found

account-hub-no-calendars = No calendars found

account-hub-email-added-success-links-title = Explore options for security and personalization:

account-hub-signature-link = Email signature

account-hub-email-error-text = Please enter a valid email address

account-hub-name-error-text = Please enter a name

account-hub-hostname-error-text = Hostname empty or invalid. Only letters, numbers, - and . are allowed
    .title = Hostname empty or invalid. Only letters, numbers, - and . are allowed

account-hub-port-error-text = Port must be between 1 and 65535
    .title = Port must be between 1 and 65535

account-hub-username-error-text = Username is required
    .title = Username is required

account-hub-oauth-pending = Waiting for authorization in login popup…

account-hub-addon-install-needed = { -brand-short-name } doesn’t natively support this server. To access Exchange email, <a data-l10n-name="addon-install"> install a third-party add-on like Owl (paid).</a>

account-hub-addon-error = Add-on installation failed. Please try again or contact the add-on author for assistance.

account-hub-security-warning = <span data-l10n-name="security-warning">Warning: Insecure mail server detected.</span> This server lacks encryption, exposing your password and data. Contact your administrator to secure the connection or proceed at your own risk. <a data-l10n-name="faq-link">See FAQ for more.</a>

account-hub-account-authentication-error = Authentication error.

account-hub-add-address-book = Add an address book

address-book-sync-existing-icon =
    .alt = Sync an address book from an existing account

address-book-sync-existing = Sync from an existing account

address-book-add-remote-icon =
    .alt = Add a new remote address book

address-book-add-remote = Add remote Address Book

address-book-add-remote-description = Connect to a remote CardDav Address Book

address-book-add-local-icon =
    .alt = Create a new local address book

address-book-add-local = New local Address Book

address-book-add-local-description = Create a new local address book on your device

address-book-add-ldap-icon =
    .alt = Connect to a remote LDAP address book

address-book-add-ldap = New LDAP Address Book

address-book-add-ldap-description = Connect to a remote LDAP address book

account-hub-fetching-sync-accounts = Discovering address books and calendars…

# $addressBooks (Number) - The number of address books that can be synced.
# $accounts (Number) - The number of accounts.
account-hub-address-book-sync-option-data =
  { $addressBooks ->
    [one] 1 address book
    *[other] { $addressBooks } address books
  } from { $accounts ->
    [one] 1 account available
    *[other] { $accounts } accounts available
  }

address-book-sync-existing-description = Retrieving existing accounts…

account-hub-select-address-book-account = Select an account with Address books

# $synced (Number) - The number of address books that are synced.
# $available (Number) - The number of address books that can be synced.
# $total (Number) - The total number of address books for this account.
account-hub-account-address-book-count = { $synced } of { $total }
    .title = { $synced } synced address books, { $available } available

account-hub-add-local-address-book = Create a Local Address Book

account-hub-local-address-book-label = Address Book Name

account-hub-local-error-text = Please enter an address book name

account-hub-sync-address-books = Sync existing address books

account-hub-new-remote-address-book = New remote Address Book

account-hub-username-label = Username

account-hub-username-warning-icon = Username is required

account-hub-address-book-username-error-text = Please enter a username

account-hub-server-label = URL/Hostname

account-hub-server-tip = Thunderbird will try to automatically detect your hostname

account-hub-server-warning-icon = Invalid URL

account-hub-server-error-text = Please enter a valid URL

account-hub-address-book-enter-password = Enter your CardDav account password

account-hub-address-book-name-label = Name

account-hub-address-book-name-error-text = Please enter a name

account-hub-address-book-base-dn = Base DN

account-hub-address-book-bind-dn = Bind DN

account-hub-ldap-form = Connect to an LDAP directory

account-hub-advanced-configuration-button = Advanced Configuration

account-hub-ldap-ssl-toggle-label = Use secure connection (SSL)

account-hub-max-results-label = Max results

account-hub-max-results-error-text = Please enter a number greater than 0

account-hub-address-book-scope-label = Scope

account-hub-address-book-scope-level-one-label =
    .label = One level

account-hub-address-book-scope-subtree-label =
    .label = Subtree

account-hub-address-book-login-method-label = Login method

account-hub-address-book-login-simple-label =
    .label = Simple

account-hub-address-book-search-label = Search filter

account-hub-simple-configuration-button = Simple Configuration

address-book-finding-remote-address-books = Searching for address books…

# $url (String) - URL of CardDAV endpoint we don't support.
address-book-carddav-known-incompatible = { $url } is known to be incompatible with { -brand-short-name }.

address-book-carddav-connection-error = Failed to connect.

address-book-ldap-duplicate-error = LDAP directory name already exists. Please input a different directory name.

address-book-ldap-creation-error = Could not create LDAP Directory.

account-hub-email-setup-ews = Server Settings

account-hub-result-host-url-label = EWS endpoint URL

account-hub-email-credentials-confirmation = Account Configuration

account-hub-result-unknown-hostname = Unknown Hostname

account-hub-result-unknown-cert = Unverified Certificate
