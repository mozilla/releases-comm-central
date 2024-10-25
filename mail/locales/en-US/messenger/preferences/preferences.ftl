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

general-language-and-appearance-header = Language & Appearance

general-incoming-mail-header = Incoming Mails

general-files-and-attachment-header = Files & Attachments

general-tags-header = Tags

general-reading-and-display-header = Reading & Display

general-updates-header = Updates

general-network-and-diskspace-header = Network & Disk Space

general-indexing-label = Indexing

composition-category-header = Composition

composition-attachments-header = Attachments

composition-spelling-title = Spelling

compose-html-style-title = HTML Style

composition-addressing-header = Addressing

privacy-main-header = Privacy

privacy-passwords-header = Passwords

privacy-junk-header = Junk

collection-header = { -brand-short-name } Data Collection and Use

collection-description = We strive to provide you with choices and collect only what we need to provide and improve { -brand-short-name } for everyone. We always ask permission before receiving personal information.
collection-privacy-notice = Privacy Notice

collection-health-report-telemetry-disabled = You’re no longer allowing { -vendor-short-name } to capture technical and interaction data. All past data will be deleted within 30 days.
collection-health-report-telemetry-disabled-link = Learn more

collection-health-report =
    .label = Allow { -brand-short-name } to send technical and interaction data to { -vendor-short-name }
    .accesskey = r
collection-health-report-link = Learn more

# This message is displayed above disabled data sharing options in developer builds
# or builds with no Telemetry support available.
collection-health-report-disabled = Data reporting is disabled for this build configuration

collection-backlogged-crash-reports =
    .label = Allow { -brand-short-name } to send backlogged crash reports on your behalf
    .accesskey = c
collection-backlogged-crash-reports-link = Learn more

privacy-security-header = Security

privacy-scam-detection-title = Scam Detection

privacy-anti-virus-title = Antivirus

privacy-certificates-title = Certificates

chat-pane-header = Chat

chat-status-title = Status

chat-notifications-title = Notifications

chat-pane-styling-header = Styling

choose-messenger-language-description = Choose the languages used to display menus, messages, and notifications from { -brand-short-name }.
manage-messenger-languages-button =
  .label = Set Alternatives…
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

start-page-label =
    .label = When { -brand-short-name } launches, show the Start Page in the message area
    .accesskey = W

location-label =
    .value = Location:
    .accesskey = o
restore-default-label =
    .label = Restore Default
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

minimize-to-tray-label =
    .label = When { -brand-short-name } is minimized, move it to the tray
    .accesskey = m

new-message-arrival = When new messages arrive:
mail-play-sound-label =
    .label = { PLATFORM() ->
        [macos] Play the following sound file:
        *[other] Play a sound
    }
    .accesskey = d
mail-play-button =
    .label = Play
    .accesskey = P

change-dock-icon = Change preferences for the app icon
app-icon-options =
    .label = App Icon Options…
    .accesskey = n

notification-settings2 = Alerts and the default sound can be disabled on the Notification pane of System Settings.

animated-alert-label =
    .label = Show an alert
    .accesskey = S
customize-alert-label =
    .label = Customize…
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
mail-custom-sound-label =
    .label = Use the following sound file
    .accesskey = U
mail-browse-sound-button =
    .label = Browse…
    .accesskey = B

enable-gloda-search-label =
    .label = Enable Global Search and Indexer
    .accesskey = G

datetime-formatting-legend = Date and Time Formatting
language-selector-legend = Language

allow-hw-accel =
    .label = Use hardware acceleration when available
    .accesskey = h

store-type-label =
    .value = Message Store Type for new accounts:
    .accesskey = T

mbox-store-label =
    .label = File per folder (mbox)
maildir-store-label =
    .label = File per message (maildir)

scrolling-legend = Scrolling
autoscroll-label =
    .label = Use autoscrolling
    .accesskey = U
smooth-scrolling-label =
    .label = Use smooth scrolling
    .accesskey = m
browsing-gtk-use-non-overlay-scrollbars =
    .label = Always show scrollbars
    .accesskey = c

window-layout-legend = Window Layout

draw-in-titlebar-label =
    .label = Hide system window titlebar
    .accesskey = H

auto-hide-tabbar-label =
    .label = Auto hide tab bar
    .accesskey = A
auto-hide-tabbar-description = Hide the tab bar when only a single tab is open

system-integration-legend = System Integration
always-check-default =
    .label = Always check to see if { -brand-short-name } is the default mail client on startup
    .accesskey = A
check-default-button =
    .label = Check Now…
    .accesskey = N

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

config-editor-button =
    .label = Config Editor…
    .accesskey = C

return-receipts-description = Determine how { -brand-short-name } handles return receipts
return-receipts-button =
    .label = Return Receipts…
    .accesskey = R

update-app-legend = { -brand-short-name } Updates

# Variables:
#   $version (String): version of Thunderbird, e.g. 68.0.1
update-app-version = Version { $version }

allow-description = Allow { -brand-short-name } to
automatic-updates-label =
    .label = Automatically install updates (recommended: improved security)
    .accesskey = A
check-updates-label =
    .label = Check for updates, but let me choose whether to install them
    .accesskey = C

update-history-button =
    .label = Show Update History
    .accesskey = p

use-service =
    .label = Use a background service to install updates
    .accesskey = b

cross-user-udpate-warning = This setting will apply to all Windows accounts and { -brand-short-name } profiles using this installation of { -brand-short-name }.

networking-legend = Connection
proxy-config-description = Configure how { -brand-short-name } connects to the Internet

network-settings-button =
    .label = Settings…
    .accesskey = S

offline-legend = Offline
offline-settings = Configure offline settings

offline-settings-button =
    .label = Offline…
    .accesskey = O

diskspace-legend = Disk Space
offline-compact-folder =
    .label = Compact all folders when it will save over
    .accesskey = a

offline-compact-folder-automatically =
    .label = Ask every time before compacting
    .accesskey = b

compact-folder-size =
    .value = MB in total

## Note: The entities use-cache-before and use-cache-after appear on a single
## line in preferences as follows:
## use-cache-before [ textbox for cache size in MB ] use-cache-after

use-cache-before =
    .value = Use up to
    .accesskey = U

use-cache-after = MB of space for the cache

##

smart-cache-label =
    .label = Override automatic cache management
    .accesskey = v

clear-cache-button =
    .label = Clear Now
    .accesskey = C

clear-cache-shutdown-label =
    .label = Clear cache on shutdown
    .accesskey = s

fonts-legend = Fonts & Colors

default-font-label =
    .value = Default font:
    .accesskey = D

default-size-label =
    .value = Size:
    .accesskey = S

font-options-button =
    .label = Advanced…
    .accesskey = A

color-options-button =
    .label = Colors…
    .accesskey = C

display-width-legend = Plain Text Messages

# Note : convert-emoticons-label 'Emoticons' are also known as 'Smileys', e.g. :-)
convert-emoticons-label =
    .label = Display emoticons as graphics
    .accesskey = e

display-text-label = When displaying quoted plain text messages:

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
    .label = Bold Italic

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

search-handler-table =
    .placeholder = Filter content types and actions

type-column-header = Content Type

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


display-tags-text = Tags can be used to categorize and prioritize your messages.

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

mark-read-no-delay =
    .label = Immediately on display
    .accesskey = o

view-attachments-inline =
    .label = View attachments inline
    .accesskey = V

## Note: This will concatenate to "After displaying for [___] seconds",
## using (mark-read-delay) and a number (seconds-label).

mark-read-delay =
    .label = After displaying for
    .accesskey = d

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

address-display-legend = Message List

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

condensed-addresses-label =
    .label = Show only display name for people in my address book
    .accesskey = S

table-layout-legend = Table View

table-layout-horizontal-scroll-label =
    .label = Allow horizontal scroll
    .accesskey = h

conversation-view-legend = Conversation view

conversation-view-checkbox-label =
    .label = Enable conversation view
    .accesskey = c
conversation-view-checkbox-description = Experimental feature based on Gloda, use it at your own risk

label-experiment = Experimental

## Compose Tab

forward-label =
    .value = Forward messages:
    .accesskey = F

inline-label =
    .label = Inline

as-attachment-label =
    .label = As Attachment

extension-label =
    .label = add extension to file name
    .accesskey = e

## Note: This will concatenate to "Auto Save every [___] minutes",
## using (auto-save-label) and a number (auto-save-end).

auto-save-label =
    .label = Auto Save every
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

spellcheck-inline-label =
    .label = Enable spellcheck as you type
    .accesskey = E

language-popup-label =
    .value = Language:
    .accesskey = L

download-dictionaries-link = Download More Dictionaries

font-label =
    .value = Font:
    .accesskey = n

font-size-label =
    .value = Size:
    .accesskey = z

default-colors-label =
    .label = Use reader’s default colors
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

default-format-label =
    .label = Use Paragraph format instead of Body Text by default
    .accesskey = P

compose-send-format-title = Sending Format

compose-send-automatic-option =
    .label = Automatic

compose-send-automatic-description = If no styling is used in the message, send Plain Text. Otherwise, send HTML with a Plain Text fallback.

compose-send-both-option =
    .label = Both HTML and Plain Text

compose-send-both-description = The recipient’s email application will determine which version to show.

compose-send-html-option =
    .label = Only HTML

compose-send-html-description = Some recipients may not be able to read the message without a Plain Text fallback.

compose-send-plain-option =
    .label = Only Plain Text

compose-send-plain-description = Some styling will be converted into a plain alternative, while other composition features will be disabled.

autocomplete-description = When addressing messages, look for matching entries in:

ab-label =
    .label = Local Address Books
    .accesskey = L

directories-label =
    .label = Directory Server:
    .accesskey = D

directories-none-label =
    .none = None

edit-directories-label =
    .label = Edit Directories…
    .accesskey = E

email-picker-label =
    .label = Automatically add outgoing email addresses to my:
    .accesskey = A

default-directory-label =
    .value = Default startup directory in the address book window:
    .accesskey = S

default-last-label =
    .none = Last used directory

attachment-label =
    .label = Check for missing attachments
    .accesskey = m

attachment-options-label =
    .label = Keywords…
    .accesskey = K

enable-cloud-share =
    .label = Offer to share for files larger than
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

mail-content = Mail Content

remote-content-label =
    .label = Allow remote content in messages
    .accesskey = m

exceptions-button =
    .label = Exceptions…
    .accesskey = E

remote-content-info =
    .value = Learn more about the privacy issues of remote content

web-content = Web Content

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
third-party-visited =
    .label = From visited

cookies-button =
    .label = Show Cookies…
    .accesskey = S

do-not-track-label =
    .label = Send websites a “Do Not Track” signal that you don’t want to be tracked
    .accesskey = n

dnt-learn-more-button =
    .value = Learn more

passwords-description = { -brand-short-name } can remember passwords for all of your accounts.

passwords-button =
    .label = Saved Passwords…
    .accesskey = S

primary-password-description = A Primary Password protects all your passwords, but you must enter it once per session.

primary-password-label =
    .label = Use a Primary Password
    .accesskey = U

# This operation requires the user to authenticate with the operating system (device sign-in)
forms-os-reauth =
    .label = Require device sign in to fill and manage passwords

primary-password-button =
    .label = Change Primary Password…
    .accesskey = C

forms-primary-pw-fips-title = You are currently in FIPS mode. FIPS requires a non-empty Primary Password.
forms-master-pw-fips-desc = Password Change Failed


junk-description = Set your default junk mail settings. Account-specific junk mail settings can be configured in Account Settings.

junk-marked-label =
    .label = When messages are marked as junk:
    .accesskey = W

junk-move-label =
    .label = Move them to the account’s “Junk” folder
    .accesskey = o

junk-delete-label =
    .label = Delete them
    .accesskey = D

junk-read-description = Mark messages as read

junk-read-manual-label =
    .label = When manually marked as junk
    .accesskey = M

junk-read-auto-label =
    .label = When { -brand-short-name } determines that they are junk
    .accesskey = T

junk-log-label =
    .label = Enable adaptive junk filter logging
    .accesskey = E

junk-log-button =
    .label = Show log
    .accesskey = S

reset-junk-button =
    .label = Reset Training Data
    .accesskey = R

phishing-description = { -brand-short-name } can analyze messages for suspected email scams by looking for common techniques used to deceive you.

phishing-label =
    .label = Tell me if the message I’m reading is a suspected email scam
    .accesskey = T

antivirus-description = { -brand-short-name } can make it easy for antivirus software to analyze incoming mail messages for viruses before they are stored locally.

antivirus-label =
    .label = Allow antivirus clients to quarantine individual incoming messages
    .accesskey = A

certificate-description = When a server requests my personal certificate:

certificate-auto =
    .label = Select one automatically
    .accesskey = S

certificate-ask =
    .label = Ask me every time
    .accesskey = A

ocsp-label =
    .label = Query OCSP responder servers to confirm the current validity of certificates
    .accesskey = Q

certificate-button =
    .label = Manage Certificates…
    .accesskey = M

security-devices-button =
    .label = Security Devices…
    .accesskey = D

email-e2ee-header = Email End-To-End Encryption

account-settings = Account Settings

email-e2ee-enable-info =
    Set up email accounts and identities for End-To-End Encryption in Account Settings.

email-e2ee-automatism = Automatic Use of Encryption
email-e2ee-automatism-pre =
    { -brand-short-name } can assist by automatically enabling or disabling encryption while composing an email.
    Auto enabling/disabling is based on the availability of valid and accepted correspondents’ keys or certificates.
email-e2ee-auto-on =
    .label = Automatically enable encryption when possible
email-e2ee-auto-off =
    .label = Automatically disable encryption when recipients change and encryption is no longer possible
email-e2ee-auto-off-notify =
    .label = Show a notification whenever encryption is disabled automatically
email-e2ee-automatism-post =
    Automatic decisions may be overridden by manually enabling or disabling encryption when composing a message.
    Note: encryption is always automatically enabled when replying to an encrypted message.

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

qr-export-pane-header = Export accounts to { -brand-product-name } Mobile

qr-export-description = Quickly transfer your account settings from desktop to mobile by generating a QR code. Select which accounts to include, decide if you want to transfer your password, and scan the code with your mobile device. Fast, secure, and simple.

qr-export-get-app = Don’t have { -brand-product-name } on mobile yet? <a data-l10n-name="app-link">Get it on Google Play</a>

qr-export-create = Create a QR code to export your accounts

qr-export-select-accounts = Select which accounts to export:

qr-export-no-accounts = Not seeing all your accounts? Some accounts may be disabled because they are not supported by { -brand-product-name } for Android. <a data-l10n-name="account-support-link">Support</a>

qr-export-accounts-legend = Email accounts

qr-export-select-all-accounts = Select all

qr-export-security-legend = Security

qr-export-include-passwords = Include all accounts passwords

qr-export-oauth-warning = Some of your accounts use an authentication method that may require re-authentication on your mobile device. You may need to enter your passwords again during this process.

qr-export-security-hint = By scanning the following QR codes, your account settings—including your email and password—will be transferred securely. We do not collect, store, or share any of this data during the process. The transfer occurs directly between your devices.

qr-export-security-warning = For your security, please ensure you are in a private setting and only scan QR codes from trusted sources.

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
