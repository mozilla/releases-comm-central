# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

account-setup-tab-title = Account Setup

## Header

account-setup-title = Set Up Your Existing Email Address

account-setup-description = To use your current email address fill in your credentials.<br/>
    { -brand-product-name } will automatically search for a working and recommended server configuration.

## Form fields

account-setup-name-label = Your full name
    .accesskey = n

# Note: "John Doe" is a multiple-use name that is used when the true name of a person is unknown. We use this fake name as an input placeholder. Translators should update this to reflect the placeholder name of their language/country.
account-setup-name-input =
    .placeholder = John Doe

account-setup-name-info-icon =
    .title = Your name, as shown to others

account-setup-name-warning = Please enter your name

account-setup-name-warning-icon =
    .title = { account-setup-name-warning }

account-setup-email-label = Email address
    .accesskey = E

account-setup-email-input =
    .placeholder = john.doe@example.com

account-setup-email-info-icon =
    .title = Your existing email address

account-setup-email-warning = Invalid email address

account-setup-email-warning-icon =
    .title = { account-setup-email-warning }

account-setup-password-label = Password
    .accesskey = P
    .title = Optional, will only be used to validate the username

account-provisioner-button = Get a new email address
    .accesskey = G

account-setup-password-toggle =
    .title = Show/hide password

account-setup-remember-password = Remember password
    .accesskey = m

account-setup-exchange-label = Your login
    .accesskey = l

#   YOURDOMAIN refers to the Windows domain in ActiveDirectory. yourusername refers to the user's account name in Windows.
account-setup-exchange-input =
    .placeholder = YOURDOMAIN\yourusername

#   Domain refers to the Windows domain in ActiveDirectory. We mean the user's login in Windows at the local corporate network.
account-setup-exchange-info-icon =
    .title = Domain login

## Action buttons

account-setup-button-cancel = Cancel
    .accesskey = a

account-setup-button-manual-config = Configure manually
    .accesskey = m

account-setup-button-stop = Stop
    .accesskey = S

account-setup-button-retest = Re-test
    .accesskey = t

account-setup-button-continue = Continue
    .accesskey = C

account-setup-button-done = Done
    .accesskey = D

## Notifications

account-setup-looking-up-settings = Looking up configuration…

account-setup-looking-up-settings-guess = Looking up configuration: Trying common server names…

account-setup-looking-up-settings-half-manual = Looking up configuration: Probing server…

account-setup-looking-up-disk = Looking up configuration: { -brand-short-name } installation…

account-setup-looking-up-isp = Looking up configuration: Email provider…

# Note: Do not translate or replace Mozilla. It stands for the public project mozilla.org, not Mozilla Corporation. The database is a generic, public domain facility usable by any client.
account-setup-looking-up-db = Looking up configuration: Mozilla ISP database…

account-setup-looking-up-mx = Looking up configuration: Incoming mail domain…

account-setup-looking-up-exchange = Looking up configuration: Exchange server…

account-setup-checking-password = Checking password…

account-setup-installing-addon = Downloading and installing add-on…

account-setup-success-half-manual = The following settings were found by probing the given server:

account-setup-success-guess = Configuration found by trying common server names.

account-setup-success-guess-offline = You are offline. We guessed some settings but you will need to enter the right settings.

account-setup-success-password = Password OK

account-setup-success-addon = Successfully installed the add-on

# Note: Do not translate or replace Mozilla. It stands for the public project mozilla.org, not Mozilla Corporation. The database is a generic, public domain facility usable by any client.
account-setup-success-settings-db = Configuration found in Mozilla ISP database.

account-setup-success-settings-disk = Configuration found on { -brand-short-name } installation.

account-setup-success-settings-isp = Configuration found at email provider.

# Note: Microsoft Exchange is a product name.
account-setup-success-settings-exchange = Configuration found for a Microsoft Exchange server.

## Illustrations

account-setup-step1-image =
    .title = Initial setup

account-setup-step2-image =
    .title = Loading…

account-setup-step3-image =
    .title = Configuration found

account-setup-step4-image =
    .title = Connection error

account-setup-privacy-footnote = Your credentials will be used according to our <a data-l10n-name="privacy-policy-link">privacy policy</a> and will only be stored locally on your computer.

account-setup-selection-help = Not sure what to select?

account-setup-selection-error = Need help?

account-setup-documentation-help = Setup documentation

account-setup-forum-help = Support forum

## Results area

account-setup-protocol-title = Select the protocol

# Note: IMAP is the name of a protocol.
account-setup-result-imap = IMAP

account-setup-result-imap-description = Keep your folders and emails synced on your server

# Note: POP3 is the name of a protocol.
account-setup-result-pop = POP3

account-setup-result-pop-description = Keep your folders and emails on your computer

# Note: Exchange is the name of a product.
account-setup-result-exchange = Exchange

account-setup-result-exchange-description = Microsoft Exchange Server

account-setup-incoming-title = Incoming

account-setup-outgoing-title = Outgoing

account-setup-username-title = Username

account-setup-exchange-title = Server

## Error messages

# Note: The reference to "janedoe" (Jane Doe) is the name of an example person. You will want to translate it to whatever example persons would be named in your language. In the example, AD is the name of the Windows domain, and this should usually not be translated.
account-setup-credentials-incomplete = Authentication failed. Either the entered credentials are incorrect or a separate username is required for logging in. This username is usually your Windows domain login with or without the domain (for example, janedoe or AD\\janedoe)

account-setup-credentials-wrong = Authentication failed. Please check the username and password

account-setup-find-settings-failed = { -brand-short-name } failed to find the settings for your email account

account-setup-exchange-config-unverifiable = Configuration could not be verified. If your username and password are correct, it’s likely that the server administrator has disabled the selected configuration for your account. Try selecting another protocol.

## Manual config area

account-setup-manual-config-title = Server settings

account-setup-incoming-protocol-label = Incoming Protocol

protocol-imap-option = { account-setup-result-imap }

protocol-pop-option = { account-setup-result-pop }

account-setup-outgoing-protocol-label = Outgoing Protocol

outgoing-protocol = SMTP

account-setup-incoming-server-label = Incoming Server

account-setup-outgoing-server-label = Outgoing Server

account-setup-incoming-port-label = Incoming Port

account-setup-outoing-port-label = Outgoing Port

account-setup-incoming-ssl-label = Incoming SSL

account-setup-outgoing-ssl-label = Outgoing SSL

ssl-autodetect-option = Autodetect

ssl-noencryption-option = None

ssl-starttls-option = STARTTLS

ssl-tls-option = SSL/TLS

account-setup-incoming-auth-label = Incoming Authentication

account-setup-outgoing-auth-label = Outgoing Authentication

account-setup-incoming-username-label = Incoming Username

account-setup-outgoing-username-label = Outgoing Username

account-setup-advanced-setup-button = Advanced config
    .accesskey = A

## Warning insecure server

account-setup-insecure-server-checkbox = I understand the risks
    .accesskey = u
