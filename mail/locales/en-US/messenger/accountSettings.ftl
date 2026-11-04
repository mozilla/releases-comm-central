# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

account-settings-color-label = Color:
  .accesskey = C

account-settings-reset-color-button =
  .title = Reset color

account-settings-addressing-title =
  .value = Writing emails

account-settings-compose-html =
    .label = Write messages in rich text (HTML)
    .accesskey = R

account-settings-address-autocomplete = Address autocomplete

account-settings-lookup-contacts =
    .value = When looking up contacts for this account:

account-settings-use-global-directory =
    .label = Use global LDAP directory settings
    .accesskey = U

account-settings-use-specific-directory =
    .label = Use a specific LDAP directory server:
    .accesskey = D

account-settings-server-title =
  .value = Server settings

account-settings-message-checking = Message checking

account-settings-check-new-messages-startup =
  .label = Check for new messages when { -brand-short-name } opens
  .accesskey = C

account-settings-security-and-sign-in = Security and sign-in

account-settings-sign-in-method =
  .value = Sign-in method:
  .accesskey = i

account-settings-clean-up-deleted-inbox =
  .label = Permanently remove deleted messages from the Inbox on exit
  .accesskey = E

account-settings-instant-server-notifications =
  .label = Get new messages when they arrive on the server
  .accesskey = w

account-settings-folder-options =
  .label = Advanced…
  .accesskey = A

account-settings-mark-deleted =
  .label = Mark as deleted without moving
  .accesskey = k

account-settings-delete-permanently =
  .label = Delete immediately
  .accesskey = d

account-settings-deleting-messages =
  .value = Deleting messages

account-settings-offline-message-storage-title =
  .value = Offline message storage

account-settings-save-all-messages =
  .label = Save copies of all folders and messages on this computer for offline use
  .accesskey = o

account-settings-save-all-messages-note = Applies to all folders in this account.

account-settings-offline-advanced-options =
  .label = Offline folder settings…
  .accesskey = v

account-settings-download-limits = Download limits

account-settings-download-limits-description = Choose which messages to store locally on this computer:

account-settings-skip-large-messages =
  .label = Skip downloading messages larger than:
  .accesskey = m

account-settings-deletion-description-imap = Set rules to automatically delete old emails from both this computer and the mail server to free up space.

account-settings-set-deletion-rules =
  .label = Set deletion rules
  .accesskey = D

delete-account-button =
  .label = Delete

default-account-button =
  .label = Set as Default

outgoing-server-name = Outgoing Server:
    .accesskey = u

outgoing-server-edit =
    .label = Edit outgoing server…
    .accesskey = o

oauth2-use-custom-details =
    .label = Use custom OAuth2 settings
    .accesskey = c
oauth2-client-id-label =
    .value = Client ID:
    .accesskey = l
oauth2-authorization-endpoint-label =
    .value = Authorization endpoint:
    .accesskey = h
oauth2-token-endpoint-label =
    .value = Token endpoint:
    .accesskey = t
oauth2-scopes-label =
    .value = Scopes:
    .accesskey = s
oauth2-redirection-endpoint-label =
    .value = Redirect URI:
    .accesskey = r
oauth2-client-secret-label =
    .value = Client secret:
    .accesskey = e
oauth2-issuer-identifier-label =
    .value = Issuer identifier:
    .accesskey = i
oauth2-use-pkce =
    .label = Use PKCE
    .accesskey = k
oauth2-use-system-browser =
    .label = Use system web browser
    .accesskey = b

ews-url-label =
    .value = Host URL:
    .accesskey = h

ews-override-oauth-details =
  .label = Override Office365 Settings:
  .accesskey = O
ews-applicationid-label =
  .value = Application ID:
  .accesskey = a
ews-tenantid-label =
  .value = Tenant ID:
  .accesskey = t
ews-endpointhost-label =
  .value = Endpoint Host:
  .accesskey = e
ews-oauthscopes-label =
  .value = OAuth Scopes:
  .accesskey = s
ews-redirecturi-label =
  .value = Redirect URI:
  .accesskey = r

# Variables:
#   $extensionName (String) - The display name of the extension providing
#     the OAuth2 settings.
# Shown in Account Settings below the authentication method when OAuth2
# settings are provided by an extension.
oauth-provider-extension-info =
    OAuth2 settings provided by extension: <a data-l10n-name="extension">{ $extensionName }</a>

## Incoming server settings

account-settings-server-document-title = Server settings

account-settings-server-type =
    .value = Server Type:

account-settings-server-name =
    .value = Server Name:
    .accesskey = S

account-settings-user-name =
    .value = User Name:
    .accesskey = N

account-settings-port =
    .value = Port:
    .accesskey = P

account-settings-default-port =
    .value = Default:

account-settings-connection-security =
    .value = Connection security:
    .accesskey = u

account-settings-connection-security-none =
    .label = None

account-settings-connection-security-starttls =
    .label = STARTTLS

account-settings-connection-security-ssl-tls =
    .label = SSL/TLS

# The label is followed by a numerical input and the message
# account-settings-minutes.
account-settings-check-new-messages-every =
    .label = Check for new messages every
    .accesskey = y

account-settings-minutes =
    .value = minutes

account-settings-automatically-download-new-messages =
    .label = Automatically download new messages
    .accesskey = m

account-settings-fetch-headers-only =
    .label = Fetch headers only
    .accesskey = e

account-settings-leave-messages-on-server =
    .label = Leave messages on server
    .accesskey = g

account-settings-leave-messages-for =
    .label = For at most
    .accesskey = o

account-settings-days =
    .value = days

account-settings-leave-messages-until-deleted =
    .label = Until I delete them
    .accesskey = d

account-settings-move-to-trash =
    .label = Move it to this folder:
    .accesskey = o

# The label is followed by a numerical input and the message
# account-settings-messages.
account-settings-ask-before-download =
    .label = Ask me before downloading more than
    .accesskey = m

account-settings-messages =
    .value = messages

account-settings-always-authenticate =
    .label = Always request authentication when connecting to this server
    .accesskey = w

account-settings-message-storage = Message Storage

account-settings-empty-trash-on-exit =
    .label = Empty Trash on Exit
    .accesskey = x

account-settings-message-store-type =
    .value = Message Store Type:
    .accesskey = T

account-settings-message-store-mbox =
    .label = File per folder (mbox)

account-settings-message-store-maildir =
    .label = File per message (maildir)

account-settings-newsrc-file =
    .value = News.rc File:

account-settings-browse-newsrc =
    .label = Browse…
    .accesskey = e
    .filepickertitle = Select News.rc File

account-settings-local-directory =
    .value = Local Directory:

account-settings-browse-local-directory =
    .label = Browse…
    .accesskey = B
    .filepickertitle = Select Local Directory

account-settings-default-text-encoding =
    .value = Default Text Encoding:

## Local Folders and RSS account settings

account-settings-document-title = Account Settings

account-settings-title =
    .value = Account Settings

# Variables:
#   $accountName (String) - The name of the account.
account-settings-document-title-with-name = { account-settings-document-title } - { $accountName }

# Variables:
#   $accountName (String) - The name of the account.
account-settings-title-with-name =
    .value = { account-settings-document-title-with-name }

account-settings-special-account-description =
    The following is a special account.  There are no identities associated with it.

account-settings-account-name =
    .value = Account Name:
    .accesskey = N

account-settings-rss-server-settings = Server Settings
