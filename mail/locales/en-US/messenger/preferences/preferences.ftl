# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

close-button =
    .aria-label = Close

preferences-doc-title2 = Settings

category-list =
    .aria-label = Categories

pane-general-title = General
category-general =
    .tooltiptext = { pane-general-title }

pane-appearance-title = Appearance
category-appearance =
    .tooltiptext = { pane-appearance-title }

pane-compose-title = Composition
category-compose =
    .tooltiptext = Composition

pane-privacy-title = Privacy & Security
category-privacy =
    .tooltiptext = Privacy & Security

pane-chat-title = Chat
category-chat =
    .tooltiptext = Chat

pane-calendar-title = Calendar
category-calendar =
    .tooltiptext = Calendar

pane-sync-title = Sync
category-sync =
    .tooltiptext = Sync

pane-qr-export-title = Export for Mobile
category-qr-export =
    .tooltiptext = Export for Mobile

general-language-and-fonts-header = Language & Fonts

general-email-notifications-header = Email notifications

general-files-and-attachment-header = Files & attachments
general-files-and-attachment-description = Select what files are saved and where they are saved on your computer.

general-tags-header = Tags

general-reading-and-viewing-header = Reading & viewing

general-updates-header = Updates

general-network-and-storage-header = Network and storage

general-search-performance-label = Search & performance

compose-writing-emails-header = Writing emails

composition-attachments-header = Attachments

composition-spelling-title = Spelling

compose-message-formatting-title = Message formatting

compose-address-autocomplete-header = Address autocomplete

privacy-main-header = Privacy

privacy-passwords-header = Passwords

privacy-spam-header = Spam

collection-improve-header = Data collected to improve { -brand-short-name }

collection-community-description = { -brand-short-name } is built by a global community. Sharing anonymous performance data helps us fix bugs faster and make the app faster for everyone.
collection-privacy-policy = Read our privacy policy

collection-data-sharing-off = <strong>Data sharing is turned off.</strong> Past usage data will be permanently deleted from { -vendor-short-name } servers within 30 days.
collection-health-report-telemetry-disabled-link = Learn more

collection-share-performance =
    .label = Share anonymous performance data with { -vendor-short-name }
    .accesskey = r
collection-share-performance-description = (Includes basic technical info like your operating system, memory usage, and feature activity. { -brand-short-name } never collects email content, contacts, or personal messages.)
collection-health-report-link = Learn more

# This message is displayed above disabled data sharing options in developer builds
# or builds with no Telemetry support available.
collection-health-report-disabled = Data reporting is disabled for this build configuration

collection-share-crash-data =
    .label = Send anonymous crash reports to { -vendor-short-name }
    .accesskey = c
collection-backlogged-crash-reports-link = Learn more

privacy-security-header = Security

privacy-scam-detection-title = Scam detection

privacy-anti-virus-title = Antivirus

privacy-security-certificates-title = Security certificates

chat-pane-header = Chat

chat-status-title = Status

chat-notifications-title = Notifications

chat-pane-styling-header = Styling

choose-display-language-description = Choose the language used for menus, buttons, and notifications.
manage-languages-button =
  .label = Manage languages…
  .accesskey = l
confirm-messenger-language-change-description = Restart { -brand-short-name } to apply these changes
confirm-messenger-language-change-button = Apply and Restart

update-setting-write-failure-title = Error saving Update preferences

# Variables:
#   $path (String) - Path to the configuration file
# The newlines between the main text and the line containing the path is
# intentional so the path is easier to identify.
update-setting-write-failure-message =
    { -brand-short-name } encountered an error and didn’t save this change. Note that setting this update preference requires permission to write to the file below. You or a system administrator may be able resolve the error by granting the Users group full control to this file.

    Could not write to file: { $path }

update-in-progress-title = Update In Progress

update-in-progress-message = Do you want { -brand-short-name } to continue with this update?

update-in-progress-ok-button = &Discard
# Continue is the cancel button so pressing escape or using a platform standard
# method of closing the UI will not discard the update.
update-in-progress-cancel-button = &Continue

account-button = Account Settings
open-addons-sidebar-button = Add-ons and Themes

## OS Authentication dialog

# This message can be seen by trying to add a Primary Password.
primary-password-os-auth-dialog-message-win = To create a Primary Password, enter your Windows login credentials. This helps protect the security of your accounts.

# This message can be seen by trying to add a Primary Password.
# The macOS strings are preceded by the operating system with "Thunderbird is trying to "
# and includes subtitle of "Enter password for the user "xxx" to allow this." These
# notes are only valid for English. Please test in your locale.
primary-password-os-auth-dialog-message-macosx = create a Primary Password

# Don't change this label.
master-password-os-auth-dialog-caption = { -brand-full-name }

## General Tab

focus-search-shortcut =
    .key = f
focus-search-shortcut-alt =
    .key = k

general-legend = { -brand-short-name } Start Page

show-start-page-label =
    .label = Show the Start Page when { -brand-short-name } opens
    .accesskey = W

location-label =
    .value = Location:
    .accesskey = o
restore-default-label =
    .label = Restore default
    .accesskey = R

default-search-engine = Default Search Engine
add-web-search-engine =
    .label = Add…
    .accesskey = A
remove-search-engine =
    .label = Remove
    .accesskey = v

add-opensearch-provider-title = Add OpenSearch Provider
add-opensearch-provider-text = Enter the URL of the OpenSearch provider to add. Either use the direct URL of the OpenSearch Description file, or a URL where it can be auto-discovered.

adding-opensearch-provider-failed-title = Adding OpenSearch Provider Failed
# Variables:
# $url (String) - URL an OpenSearch provider was requested for.
adding-opensearch-provider-failed-text = Could not add OpenSearch Provider for { $url }.

close-to-tray-label =
    .label = When { -brand-short-name } is closed, move it to the tray
    .accesskey = c
start-in-tray-label =
    .label = Start { -brand-short-name } in the tray
    .accesskey = S

new-message-arrival-legend = When a new message arrives:
mail-play-sound-label =
    .label = { PLATFORM() ->
        [macos] Play the following sound file:
        *[other] Play a sound
    }
    .accesskey = d
mail-play-button =
    .label = Play
    .accesskey = P

change-dock-icon-description = App badges and notifications
app-icon-options =
    .label = App icon options…
    .accesskey = n

new-email-alert-label =
    .label = Show an alert for new emails
    .accesskey = S
customize-alerts-label =
    .label = Customize alerts…
    .accesskey = C

biff-use-system-alert =
    .label = Use the system notification

tray-icon-unread-label =
    .label = Show a tray icon for unread messages
    .accesskey = t

tray-icon-unread-description = Recommended when using small taskbar buttons

mail-system-sound-label =
    .label = Default system sound for new mail
    .accesskey = D
use-custom-sound-label =
    .label = Use custom sound for alerts
    .accesskey = U
mail-select-audio-button =
    .label = Select audio…
    .accesskey = A

enable-global-search-label =
    .label = Turn on search across all email accounts
    .accesskey = e

gloda-results-plain-list-label =
    .label = Show search results as a plain list
    .accesskey = L

datetime-formatting-legend = Date and Time Formatting
display-language-legend = Display language

allow-graphics-accel =
    .label = Use graphics acceleration for smoother scrolling and performance
    .accesskey = h

storage-format-label =
    .value = Storage format for new accounts:
    .accesskey = T

mbox-store-single-label =
    .label = Single file per folder (mbox)
maildir-store-label =
    .label = File per message (maildir)

scrolling-legend = Scrolling
enable-autoscroll-label =
    .label = Enable auto-scrolling
    .accesskey = g
smooth-scrolling-label =
    .label = Use smooth scrolling
    .accesskey = m
browsing-gtk-use-non-overlay-scrollbars =
    .label = Always show scrollbars
    .accesskey = c

window-layout-legend = Window Layout

hide-titlebar-label =
    .label = Hide title bar
    .accesskey = H
hide-titlebar-description = Removes the top bar showing the window name to save screen space

hide-tabbar-single-tab-label =
    .label = Hide the tab bar when only a single tab is open
    .accesskey = T
auto-hide-tabbar-second-tab-description = Automatically hides tabs until you open a second tab.

system-settings-legend = System settings
check-email-app-label =
    .label = Always check to see if { -brand-short-name } is the default email app when opened
    .accesskey = A
edit-defaults-apps-button =
    .label = Edit defaults…
    .accesskey = u

# Note: This is the search engine name for all the different platforms.
# Platforms that don't support it should be left blank.
search-engine-name = { PLATFORM() ->
    [macos] Spotlight
    [windows] Windows Search
    *[other] { "" }
}

search-integration-label =
    .label = Allow { search-engine-name } to search messages
    .accesskey = S

advanced-settings-button =
    .label = Advanced settings
    .accesskey = v

return-receipts-description = Determine how { -brand-short-name } handles return receipts
return-receipts-button =
    .label = Return Receipts…
    .accesskey = R

update-app-legend = { -brand-short-name } Updates

# Variables:
#   $version (String): version of Thunderbird, e.g. 68.0.1
update-app-version = Version { $version }

update-settings-title = Update settings
install-updates-automatically-label =
    .label = Automatically install updates (recommended)
    .accesskey = A
install-updates-automatically-description = Keeps { -brand-short-name } secure with the latest security fixes.
check-updates-ask-label =
    .label = Check for updates, but ask before installing
    .accesskey = C

update-application-background-enabled =
    .label = When { -brand-short-name } is not running
    .accesskey = W

show-history-button =
    .label = Show history
    .accesskey = h

use-service =
    .label = Use a background service to install updates
    .accesskey = b

cross-user-udpate-warning = This setting will apply to all Windows accounts and { -brand-short-name } profiles using this installation of { -brand-short-name }.

networking-legend = Connection
connection-config-description = Control how { -brand-short-name } connects to the internet.

connection-options-button =
    .label = Connection options…
    .accesskey = S

offline-mode-legend = Offline mode
offline-settings-label = Offline settings

offline-settings-button =
    .label = Offline…
    .accesskey = O

temporary-storage-legend = Temporary storage
offline-compact-remove-deleted =
    .label = Remove data from folders when they have already been deleted to free up storage
    .accesskey = a

offline-compact-ask-cleanup =
    .label = Ask before cleaning up folders
    .accesskey = b

compact-folder-size =
    .value = MB in total

## Note: The entities use-cache-before and use-temp-storage-after appear on a single
## line in preferences as follows:
## use-cache-before [ textbox for cache size in MB ] use-temp-storage-after

use-cache-before =
    .value = Use up to
    .accesskey = U

use-temp-storage-after = MB of space for temporary files

##

manual-storage-limit-label =
    .label = Manually set storage limits for temporary files
    .accesskey = M

clear-temp-files-button =
    .label = Clear temporary files
    .accesskey = C

clear-temp-files-shutdown-label =
    .label = Clear temporary files when { -brand-short-name } closes
    .accesskey = s

underline-text-links-label =
    .label = Underline text links in messages
    .accesskey = k

font-legend = Fonts

default-font-label =
    .value = Default font:
    .accesskey = D

default-size-label =
    .value = Size:
    .accesskey = S

customize-fonts-button =
    .label = Customize fonts…
    .accesskey = f

display-width-legend = Plain text messages

# Note : convert-emoticons-label 'Emoticons' are also known as 'Smileys', e.g. :-)
convert-emoticons-label =
    .label = Display emoticons as graphics
    .accesskey = e

display-text-formatting-label = Quoted text formatting

style-label =
    .value = Style:
    .accesskey = y

regular-style-item =
    .label = Regular
bold-style-item =
    .label = Bold
italic-style-item =
    .label = Italic
bold-italic-style-item =
    .label = Bold italic

size-label =
    .value = Size:
    .accesskey = z

regular-size-item =
    .label = Regular
bigger-size-item =
    .label = Bigger
smaller-size-item =
    .label = Smaller

quoted-text-color =
    .label = Color:
    .accesskey = o

search-content-types =
    .placeholder = Search types of content

type-column-header = Content type

action-column-header = Action

save-to-label =
    .label = Save files to
    .accesskey = S

choose-folder-label =
    .label = { PLATFORM() ->
        [macos] Choose…
        *[other] Browse…
    }
    .accesskey = { PLATFORM() ->
        [macos] C
        *[other] B
    }

always-ask-label =
    .label = Always ask me where to save files
    .accesskey = A


use-tags-text = Use tags to categorize and prioritize messages.

new-tag-button =
    .label = New…
    .accesskey = N

edit-tag-button =
    .label = Edit…
    .accesskey = E

delete-tag-button =
    .label = Delete
    .accesskey = D

auto-mark-as-read =
    .label = Automatically mark messages as read
    .accesskey = A

mark-read-when-opened =
    .label = Immediately when opened
    .accesskey = o

show-attachments-inline-label =
    .label = Show attachments inside the message body
    .accesskey = m

## Note: This will concatenate to "After viewing for [___] seconds",
## using (mark-read-after-viewing) and a number (seconds-label).

mark-read-after-viewing =
    .label = After viewing for
    .accesskey = v

seconds-label = seconds

##

open-msg-label =
    .value = Open messages in:

open-msg-tab =
    .label = A new tab
    .accesskey = t

open-msg-window =
    .label = A new message window
    .accesskey = n

open-msg-ex-window =
    .label = An existing message window
    .accesskey = e

close-move-delete =
    .label = Close message window/tab on move or delete
    .accesskey = C

address-display-legend = Message list

address-display-description = Preferred address display format:

address-display-full =
    .label = Full name and email address
    .accesskey = F

address-display-email =
    .label = Email only
    .accesskey = E

address-display-name =
    .label = Name only
    .accesskey = N

display-name-only-label =
    .label = Only show display name for contacts saved in the address book
    .accesskey = S

table-layout-legend = Table View

table-layout-horizontal-scroll-label =
    .label = Allow horizontal scroll
    .accesskey = h

conversation-view-legend = Conversation view

show-conversation-view-label =
    .label = Show conversation view
    .accesskey = c
conversation-view-preview-description = This is an early preview feature. It groups related messages together, but it might not always work as expected.

label-experiment = Experimental

dark-mode-message-appearance = Message appearance

dark-mode-checkbox-label =
    .label = Use dark mode for message text
    .accesskey = d
dark-mode-message-text-description = Applies a dark background to all incoming messages, even if the sender formatted them in light colors.

dark-message-mode-toggle-label =
    .label = Show dark message mode toggle
    .accesskey = t
dark-mode-toggle-description = Lets you quickly switch an email back to light mode while reading, without changing your main settings.

general-folder-settings-header = Folder settings

recent-folders-legend = Recent folders
recent-folders-description = Controls how recently used folders appear when moving messages.

recent-sort-order-label = Sort order:
    .accesskey = S

recent-sort-order-mru =
    .label = Most recent

recent-sort-order-alphabetic =
    .label = Alphabetical

max-recent-label = Maximum number of recent folders:
    .accesskey = M

account-hub-legend = Account hub

account-hub-checkbox-label =
    .label = Create accounts in the new Account Hub
    .accesskey = C

account-hub-checkbox-description = Experimental new mail account creation flow

account-hub-manual-config-checkbox-label =
    .label = Use the new manual configuration flow in Account Hub
    .accesskey = c

account-hub-manual-config-checkbox-description = New account hub manual configuration flow

new-calendar-legend = New Calendar Event Dialog

new-calendar-checkbox-label =
    .label = View calendar events in the new dialog

new-calendar-checkbox-description = Experimental new calendar dialog for viewing events

## Compose Tab

forward-messages-label =
    .value = Forward messages as:
    .accesskey = F

forward-inline-label =
    .label = Inside the message (inline)

as-attachment-label =
    .label = As Attachment

add-file-type-label =
    .label = Add file type to attached messages
    .accesskey = e

## Note: This will concatenate to "Auto Save every [___] minutes",
## using (auto-save-label) and a number (auto-save-end).

autosave-draft-label =
    .label = Automatically save a draft every
    .accesskey = A

auto-save-end = minutes

##

warn-on-send-accel-key =
    .label = Confirm when using keyboard shortcut to send message
    .accesskey = C

add-link-previews =
    .label = Add link previews when pasting URLs
    .accesskey = i

spellcheck-label =
    .label = Check spelling before sending
    .accesskey = C

spellcheck-while-typing-label =
    .label = Check spelling while typing
    .accesskey = E

language-popup-label =
    .value = Language:
    .accesskey = L

download-dictionaries-link = Download more dictionaries

font-label =
    .value = Font:
    .accesskey = n

font-size-label =
    .value = Size:
    .accesskey = z

ignore-sender-styles-label =
    .label = Ignore sender fonts and colors
    .accesskey = d

font-color-label =
    .value = Text Color:
    .accesskey = T

bg-color-label =
    .value = Background Color:
    .accesskey = B

restore-html-label =
    .label = Restore Defaults
    .accesskey = R

paragraph-spacing-label =
    .label = Pressing Enter starts a new paragraph with extra spacing
    .accesskey = P

compose-send-format-title = Sending format

compose-format-automatic-option =
    .label = Automatic (recommended)

compose-format-automatic-description = Send formatted text if you add styles (like bold or links), or plain text if you don’t.

compose-format-both-option =
    .label = Both rich text (HTML) and plain text

compose-format-both-description = Always sends both versions so the recipient’s email app can choose which one to display.

compose-format-html-option =
    .label = Rich text (HTML) only

compose-format-html-description = Keeps custom fonts, colors, and images, but some older email apps may not display it properly.

compose-format-plain-option =
    .label = Plain text only

compose-format-plain-description = Removes all formatting, colors, and images. Best for simple text emails that work everywhere.

autocomplete-matches-description = When typing a recipient’s name or email, look for matches in:

company-network-directory-label =
    .label = Company or network directory
    .accesskey = C

directory-server-label =
    .label = Directory server
    .accesskey = D

directories-none-label =
    .none = None

manage-directories-label =
    .label = Manage directories…
    .accesskey = E

collect-outgoing-label =
    .label = Automatically save outgoing email addresses to:
    .accesskey = A

collect-outgoing-description = Where new contacts are saved when created manually or added from emails.

save-added-contacts-label =
    .value = Save manually added contacts to:
    .accesskey = m

save-added-contacts-description = Where new contacts are saved from emails.

show-directory-startup-label =
    .value = Show directory in the address book window when opening { -brand-short-name }
    .accesskey = S

default-last-label =
    .none = Last used directory

attachment-label =
    .label = Check for missing attachments
    .accesskey = m

edit-keywords-label =
    .label = Edit keywords…
    .accesskey = K

offer-share-large-files-label =
    .label = Offer to share files by link when they exceed:
cloud-share-size =
    .value = MB

add-cloud-account =
    .label = Add…
    .accesskey = A
    .defaultlabel = Add…

remove-cloud-account =
    .label = Remove
    .accesskey = R

find-cloud-providers =
    .value = Find more providers…

cloud-account-description = Add a new Filelink storage service

## Privacy Tab

email-content = Email content

remote-content-images-label =
    .label = Allow remote content (images and styles)
    .accesskey = m

exceptions-button =
    .label = Exceptions…
    .accesskey = E

remote-content-privacy-link = How remote content affects privacy

web-content = Web content

history-label =
    .label = Remember websites and links I’ve visited
    .accesskey = R

cookies-label =
    .label = Accept cookies from sites
    .accesskey = A

third-party-label =
    .value = Accept third-party cookies:
    .accesskey = c

third-party-always =
    .label = Always
third-party-never =
    .label = Never
third-party-visited-only =
    .label = From visited sites only

cookies-button =
    .label = Show Cookies…
    .accesskey = S

# Do not translate.
# "Global Privacy Control" or "GPC" are a web platform feature name and abbreviation
# included to facilitate power-user search of the about:preferences page.
global-privacy-control-search = Global Privacy Control (GPC)

global-privacy-control-label =
    .label = Ask websites not to sell or share personal data
    .accesskey = n

do-not-track-removal = We no longer support the “Do Not Track” signal

passwords-registered-description = { -brand-short-name } can save passwords for registered accounts.

view-saved-passwords-button =
    .label = View Saved Passwords…
    .accesskey = S

primary-password-session-description = A Primary Password protects all passwords and is entered once per session.

use-primary-password-label =
    .label = Use Primary Password
    .accesskey = U

# This operation requires the user to authenticate with the operating system (device sign-in)
forms-os-reauth =
    .label = Require device sign in to fill and manage passwords

primary-password-button =
    .label = Change Primary Password…
    .accesskey = C

forms-primary-pw-fips-title = You are currently in FIPS mode. FIPS requires a non-empty Primary Password.
forms-master-pw-fips-desc = Password Change Failed


spam-accounts-description = These settings apply to all accounts. Individual account options can be changed in Account Settings.

spam-marked-label =
    .label = When messages are marked as spam:
    .accesskey = W

spam-move-folder-label =
    .label = Move to the Spam folder
    .accesskey = o

spam-delete-immediately-label =
    .label = Delete immediately
    .accesskey = D

spam-read-description = Mark messages as read

spam-marked-manually-label =
    .label = When marked manually
    .accesskey = M

spam-detected-auto-label =
    .label = When detected automatically by { -brand-short-name }
    .accesskey = T

spam-log-keep-label =
    .label = Keep a log of automatic spam detection
    .accesskey = E

spam-log-button =
    .label = Show log
    .accesskey = S

reset-spam-button =
    .label = Reset Training Data
    .accesskey = R

scam-detection-description = { -brand-short-name } checks messages for phishing links and common signs of email scams.

scam-detection-label =
    .label = Warn when reading an email that looks like a scam
    .accesskey = T

antivirus-check-description = Allows antivirus software to check incoming messages individually before they are saved to your computer.

antivirus-isolate-label =
    .label = Allow antivirus software to isolate infected incoming emails
    .accesskey = A

certificate-verify-description = When a server asks for a certificate to verify your identity:

certificate-choose-auto =
    .label = Choose a certificate automatically
    .accesskey = h

certificate-ask-every =
    .label = Ask every time
    .accesskey = A

ocsp-check-label =
    .label = Check certificate validation servers (OCSP) to confirm certificates are still correct.
    .accesskey = v

certificate-button =
    .label = Manage Certificates…
    .accesskey = M

security-devices-button =
    .label = Security Devices…
    .accesskey = D

email-e2ee-header = Email end-to-end encryption

account-settings = Account Settings

email-e2ee-accounts-info = Encrypted emails can only be read by you and your recipients. Set up email accounts and identities for end-to-end encryption in the <a data-l10n-name="account-settings-url">Account settings</a>.

email-e2ee-automatism = Automatic use of encryption
email-e2ee-automatism-intro = { -brand-short-name } can turn encryption on if valid accepted keys or certificates are available for all recipients of a message.
email-e2ee-turn-on =
    .label = Automatically turn on encryption when possible
email-e2ee-turn-off =
    .label = Automatically turn off encryption when recipients change and encryption is no longer possible
email-e2ee-turn-off-notify =
    .label = Show a notification whenever encryption is turned off automatically
email-e2ee-automatism-note = Note: You can also manually turn encryption on or off while writing a message. Replying to an encrypted messages always turns on encryption.

## DoH Section

preferences-doh-secure-header = Secure DNS (DNS over HTTPS)

preferences-doh-secure-description = Secure DNS encrypts the lookup requests { -brand-short-name } sends to find websites, keeping your browsing activity private from any network monitoring.

# Variables:
#   $status (string) - The status of the DoH connection
preferences-doh-status = Status: { $status }
# Variables:
#   $name (string) - The name of the DNS over HTTPS resolver. If a custom resolver is used, the name will be the domain of the URL.
preferences-doh-resolver = Provider: { $name }
# This is displayed instead of $name in preferences-doh-resolver
# when the DoH URL is not a valid URL
preferences-doh-bad-url = Invalid URL
preferences-doh-steering-status = Using local provider

preferences-doh-status-active = Active
preferences-doh-status-disabled = Off
# Variables:
#   $reason (string) - A string representation of the reason DoH is not active. For example NS_ERROR_UNKNOWN_HOST or TRR_RCODE_FAIL.
preferences-doh-status-not-active = Not active ({ $reason })

preferences-doh-group-message = Enable DNS over HTTPS using:

preferences-doh-expand-section =
  .tooltiptext = More information

preferences-doh-setting-automatic =
  .label = Automatic protection (Recommended)
  .accesskey = D
preferences-doh-automatic-desc = { -brand-short-name } automatically encrypts address lookups when available. Switches back to standard network lookups if there’s a connection issue or if a VPN/managed network requires it.
preferences-doh-default-detailed-desc-1 = Use secure DNS in regions where it’s available
preferences-doh-default-detailed-desc-2 = Use your default DNS resolver if there is a problem with the secure DNS provider
preferences-doh-default-detailed-desc-3 = Use a local provider, if possible
preferences-doh-default-detailed-desc-4 = Turn off when VPN, parental control, or enterprise policies are active
preferences-doh-default-detailed-desc-5 = Turn off when a network tells { -brand-short-name } it shouldn’t use secure DNS

preferences-doh-setting-enabled =
  .label = Increased protection
  .accesskey = I
preferences-doh-increased-desc = Always uses chosen provider. Uses standard connection only if secure provider fails.
preferences-doh-enabled-detailed-desc-1 = Use the provider you select
preferences-doh-enabled-detailed-desc-2 = Only use your default DNS resolver if there is a problem with secure DNS

preferences-doh-setting-maximum =
  .label = Maximum protection
  .accesskey = M
preferences-doh-maximum-desc = Strictly requires encrypted DNS. Websites will not load if secure connection fails.
preferences-doh-strict-detailed-desc-1 = Only use the provider you select
preferences-doh-strict-detailed-desc-2 = Always warn if secure DNS isn’t available
preferences-doh-strict-detailed-desc-3 = If secure DNS is not available sites will not load or function properly

preferences-doh-setting-off =
  .label = Off
  .accesskey = O
preferences-doh-off-standard-desc = Uses standard internet provider or network to look up web addresses

preferences-doh-checkbox-warn =
    .label = Warn if a third party actively prevents secure DNS
    .accesskey = W

preferences-doh-select-resolver = Choose provider:

# Variables:
#   $name (String) - Display name or URL for the DNS over HTTPS provider
preferences-doh-url-default =
    .label = { $name } (Default)

preferences-doh-url-custom =
    .label = Custom
    .accesskey = C

## Keyservers

email-e2ee-key-servers-legend = OpenPGP Keyservers

email-e2ee-key-servers-intro =
    A keyserver receives and then serves existing public keys to users.
    It allows you to publish your public key and find and refresh keys of others.

email-e2ee-key-servers-use-following = Use the following keyservers:

email-e2ee-key-servers-add = Add…
email-e2ee-key-servers-reset = Reset Server List

email-e2ee-key-servers-add-title = Add Keyserver
email-e2ee-key-servers-add-text = Enter the URL of the keyserver to add.
email-e2ee-key-servers-add-failed-title = Adding Keyserver Failed
email-e2ee-key-servers-add-failed-text = Could not connect to a keyserver at the provided URL.

## Chat Tab

startup-label =
    .value = When { -brand-short-name } starts:
    .accesskey = s

offline-label =
    .label = Keep my Chat Accounts offline

auto-connect-label =
    .label = Connect my chat accounts automatically

## Note: idle-label is displayed first, then there's a field where the user
## can enter a number, and itemTime is displayed at the end of the line.
## The translations of the idle-label and idle-time-label parts don't have
## to mean the exact same thing as in English; please try instead to
## translate the whole sentence.

idle-label =
    .label = Let my contacts know that I am Idle after
    .accesskey = I

idle-time-label = minutes of inactivity

##

away-message-label =
    .label = and set my status to Away with this status message:
    .accesskey = A

send-typing-label =
    .label = Send typing notifications in conversations
    .accesskey = t

notification-label = When messages directed at you arrive:

show-notification-label =
    .label = Show a notification:
    .accesskey = c

notification-all =
    .label = with sender’s name and message preview
notification-name =
    .label = with sender’s name only
notification-empty =
    .label = without any info

notification-type-label =
    .label = { PLATFORM() ->
        [macos] Animate dock icon
        *[other] Flash the taskbar item
    }
    .accesskey = { PLATFORM() ->
        [macos] o
        *[other] F
    }

chat-play-sound-label =
    .label = Play a sound
    .accesskey = d

chat-play-button =
    .label = Play
    .accesskey = P

chat-system-sound-label =
    .label = Default system sound for new mail
    .accesskey = D

chat-custom-sound-label =
    .label = Use the following sound file
    .accesskey = U

chat-browse-sound-button =
    .label = Browse…
    .accesskey = B

theme-label =
    .value = Theme:
    .accesskey = T

style-mail =
    .label = { -brand-short-name }
style-bubbles =
    .label = Bubbles
style-dark =
    .label = Dark
style-paper =
    .label = Paper Sheets
style-simple =
    .label = Simple

preview-label = Preview:
no-preview-label = No preview available
no-preview-description = This theme is not valid or is currently unavailable (disabled addon, safe-mode, …).

chat-variant-label =
    .value = Variant:
    .accesskey = V

# This is used to determine the width of the search field in about:preferences,
# in order to make the entire placeholder string visible
#
# Please keep the placeholder string short to avoid truncation.
#
# Notice: The value of the `.style` attribute is a CSS string, and the `width`
# is the name of the CSS property. It is intended only to adjust the element's width.
# Do not translate.
search-preferences-input2 =
    .style = width: 15.4em
    .placeholder = Find in Settings

managed-by-organization-notice = { -brand-short-name } is managed by an organization.

## Settings UI Search Results

search-results-header = Search Results

# `<span data-l10n-name="query"></span>` will be replaced by the search term.
search-results-empty-message2 = { PLATFORM() ->
    [windows] Sorry! There are no results in Options for “<span data-l10n-name="query"></span>”.
    *[other] Sorry! There are no results in Settings for “<span data-l10n-name="query"></span>”.
}

search-results-help-link = Need help? Visit <a data-l10n-name="url">{ -brand-short-name } Support</a>

## Sync Tab

sync-signedout-caption = Take Your Web With You

sync-signedout-description = Synchronize your accounts, address books, calendars, add-ons, and settings across all your devices.

# Note: "Sync" represents the Firefox Sync product so it shouldn't be translated.
sync-signedout-account-signin-btn = Sign in to Sync…

sync-pane-header = Sync

# Variables:
# $userEmail (String) - The email logged into Sync.
sync-pane-email-not-verified = “{ $userEmail }” is not verified.

# Variables:
# $userEmail (String) - The email logged into Sync.
sync-signedin-login-failure = Please sign in to reconnect “{ $userEmail }”

sync-pane-resend-verification = Resend verification

sync-pane-sign-in = Sign in

sync-pane-remove-account = Remove account

sync-pane-edit-photo =
  .title = Change profile picture

sync-pane-manage-account = Manage account

sync-pane-sign-out = Sign out…

sync-pane-device-name-title = Device Name

sync-pane-change-device-name = Change device name

sync-pane-cancel = Cancel

sync-pane-save = Save

sync-pane-show-synced-header-on = Syncing ON

sync-pane-show-synced-header-off = Syncing OFF

sync-pane-sync-now = Sync Now

sync-panel-sync-now-syncing = Syncing…

show-synced-list-heading = You are currently syncing these items:

show-synced-learn-more = Learn more…

show-synced-item-account = Email Accounts

show-synced-item-address = Address Books

show-synced-item-calendar = Calendars

show-synced-item-identity = Identities

show-synced-item-passwords = Passwords

show-synced-change = Change…

synced-acount-item-server-config = Server configuration

synced-acount-item-filters = Filters

synced-acount-item-keys = OpenPGP - S/MIME

sync-disconnected-text = Synchronize your email accounts, address books, calendars, and identities across all your devices.

sync-disconnected-turn-on-sync = Turn on Syncing…

## Mobile QR Export Pane

qr-export-pane-header-mobile = Export to { -brand-product-name } mobile

qr-export-description-email-accounts = Transfer your email accounts from this computer to { -brand-product-name } on your phone using a QR code.

qr-export-get-app-google-play = <a data-l10n-name="app-link">Get { -brand-product-name } on Google Play</a>

qr-export-select-accounts-title = Select accounts to export:

qr-export-missing-accounts-support = Missing an account? Accounts that are not supported on { -brand-product-name } for Android cannot be selected. <a data-l10n-name="account-support-link">Learn which account types are supported</a>

qr-export-accounts-legend = Email accounts

qr-export-select-all-accounts = Select all

qr-export-passwords-legend = Passwords

qr-export-include-passwords-label = Include account passwords in the QR code

qr-export-web-sign-in-note = <strong>Note:</strong> Accounts that use web sign-in (like Gmail or Yahoo), require authentication again on your device.

qr-export-private-transfer-note = <strong>Private transfer:</strong> Your settings and passwords move directly from this computer to your phone. Nothing is sent to or stored on Mozilla servers.

qr-export-screen-privacy-tip = <strong>Tip:</strong> Keep your screen hidden from others while the QR code is displayed.

qr-export-start-export = Export

# Variables:
# $count (Number) - Total number of QR codes to step through.
# $step (Number) - Current step number of the QR code displayed.
qr-export-scan-progress = { $count ->
    [one] { $step } of { $count } QR code
    *[other] { $step } of { $count } QR codes
}

# Variables:
# $count (Number) - Total number of QR codes to step through.
qr-export-scan-description = { $count ->
    [one] Scan QR code with { -brand-product-name } on your mobile device
    *[other] Scan QR codes with { -brand-product-name } on your mobile device
}

qr-export-scan-step1 = Open { -brand-product-name } on your mobile device
qr-export-scan-step2 = Go to settings

# The strong label should match https://hosted.weblate.org/translate/tb-android/settings-import/en/?checksum=bd1817a6fc9f758b&sort_by=-priority,position#translations
qr-export-scan-step3 = Select <strong>Import settings</strong>

# The strong label should match https://hosted.weblate.org/translate/tb-android/settings-import/en/?checksum=0db0b6c1d176a59b&sort_by=-priority,position#translations
qr-export-scan-step4-revision = Tap <strong>Scan QR code</strong> and hold your phone over this code

qr-export-back = Back

qr-export-next = Next

qr-export-done = Done

qr-export-summary-description = Accounts exported. Continue on your mobile device.

qr-export-summary-title = Export summary:

# Variables:
# $count (Number) - Total number of QR codes shown to the user.
qr-export-summary-qr-count = { $count ->
    [one] { $count } QR code generated
    *[other] { $count } QR codes generated
}

# Variables:
# $count (Number) - Number of accounts included in the export.
qr-export-summary-accounts = { $count ->
    [one] { $count } account exported:
    *[other] { $count } accounts exported:
}

qr-export-summary-passwords-included = Passwords included

qr-export-summary-passwords-excluded = Passwords excluded

qr-export-more-accounts = Export more accounts

## Appearance Tab

appearance-category-header = Appearance

accent-color-legend = Accent Color

accent-color-selection-label =
    .value = Select color for primary button and highlights

accent-color-os =
    .label = Follow operating system

accent-color-thunderbird =
    .label = Thunderbird blue

accent-color-purple =
    .label = Purple

accent-color-orange =
    .label = Orange

accent-color-pink =
    .label = Pink

accent-color-ink =
    .label = Ink

accent-color-teal =
    .label = Teal

accent-color-disabled-description = Accent colors are not supported in High Contrast mode.

default-message-list-legend = Message List

appearance-view-style-select =
    .value = Select view style:

appearance-radio-table =
    .label = Table view

appearance-radio-card-view =
    .label = Card view

card-view-options-legend = Card view options

table-view-legend = Table View Options

appearance-card-rows =
    .value = Row count:

appearance-card-style-3 =
    .label = 3 rows

appearance-card-style-2 =
    .label = 2 rows

default-message-list-sorting-legend = Sorting and threading

default-message-list-new-folders-description = Select default sorting and threading options for new folders

default-flag-label =
    .value = Default Threading:

default-flag-unthreaded =
    .label = Unthreaded

default-flag-threaded =
    .label = Threaded

default-flag-grouped =
    .label = Grouped by Sort

default-sort-by-label = Sort messages by:

default-sort-date =
    .label = Date

default-sort-subject =
    .label = Subject

default-sort-from =
    .label = From

default-sort-id =
    .label = ID

default-sort-thread =
    .label = Thread

default-sort-priority =
    .label = Priority

default-sort-status =
    .label = Status

default-sort-size =
    .label = Size

default-sort-star =
    .label = Star

default-sort-unread =
    .label = Read

default-sort-recipient =
    .label = Recipient

default-sort-location =
    .label = Location

default-sort-tags =
    .label = Tags

default-sort-spam =
    .label = Spam Status

default-sort-attachments =
    .label = Attachments

default-sort-account =
    .label = Account

default-sort-received =
    .label = Order Received

default-sort-correspondents =
    .label = Correspondents

default-order-label = Default sort order

default-sort-newest-bottom =
    .label = Newest messages at the bottom

default-sort-new-messages-top =
    .label = Newest messages at the top

apply-view-settings-label = Apply these view settings to:

apply-view-settings-to-all-folders-button =
    .label = All folders and subfolders
    .accesskey = A

select-apply-sort-folders-button =
    .label = Select folders
    .accesskey = S

apply-current-view-to-folder =
    .label = Folder…

apply-current-view-to-folder-children =
    .label = Folder and its children…

apply-changes-prompt-title = Apply Changes?

apply-changes-prompt-message = Apply the current threading and sorting settings to all folders?

# Variables:
#  $name (String): The name of the folder to apply to.
apply-changes-prompt-folder-message = Apply the current threading and sorting settings to “{ $name }”?

# Variables:
#  $name (String): The name of the folder to apply to.
apply-changes-prompt-folder-children-message = Apply the current threading and sorting settings to “{ $name }” and its children?

apply-current-view-error = Unable to apply current view settings

apply-current-view-success = Current view settings applied successfully
