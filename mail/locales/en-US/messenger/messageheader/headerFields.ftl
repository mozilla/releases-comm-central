# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Header lists

message-header-to-list-name = To

message-header-from-list-name = From

message-header-sender-list-name = Sender

message-header-reply-to-list-name = Reply to

message-header-cc-list-name = Cc

message-header-bcc-list-name = Bcc

message-header-newsgroups-list-name = Newsgroups

message-header-followup-to-list-name = Followup to

message-header-tags-list-name = Tags

# List management header - RFC 2369.
message-header-list-id = List-ID

# List management header - RFC 2369.
message-header-list-help = List-Help

# List management header - RFC 2369.
message-header-list-unsubscribe = List-Unsubscribe

# List management header - RFC 2369.
message-header-list-subscribe = List-Subscribe

# List management header - RFC 2369.
message-header-list-post = List-Post

# List management header - RFC 2369.
message-header-list-owner = List-Owner

# List management header - RFC 2369.
message-header-list-archive = List-Archive

# Direct link to the archived form of an individual email message - RFC 5064.
message-header-archived-at = Archived-At

## Other message headers.
## The field-separator is for screen readers to separate the field name from the field value.

message-header-author-field = Author<span data-l10n-name="field-separator">:</span>

message-header-organization-field = Organization<span data-l10n-name="field-separator">:</span>

message-header-subject-field = Subject<span data-l10n-name="field-separator">:</span>

message-header-date-field = Date<span data-l10n-name="field-separator">:</span>

message-header-user-agent-field = User agent<span data-l10n-name="field-separator">:</span>

message-header-references-field = References<span data-l10n-name="field-separator">:</span>

message-header-message-id-field = Message ID<span data-l10n-name="field-separator">:</span>

message-header-in-reply-to-field = In reply to<span data-l10n-name="field-separator">:</span>

message-header-website-field = Website<span data-l10n-name="field-separator">:</span>

message-header-list-id-field = List-ID<span data-l10n-name="field-separator">:</span>

message-header-list-help-field = List-Help<span data-l10n-name="field-separator">:</span>

message-header-list-unsubscribe-field = List-Unsubscribe<span data-l10n-name="field-separator">:</span>

message-header-list-subscribe-field = List-Subscribe<span data-l10n-name="field-separator">:</span>

message-header-list-post-field = List-Post<span data-l10n-name="field-separator">:</span>

message-header-list-owner-field = List-Owner<span data-l10n-name="field-separator">:</span>

message-header-list-archive-field = List-Archive<span data-l10n-name="field-separator">:</span>

message-header-archived-at-field = Archived-At<span data-l10n-name="field-separator">:</span>

# Describes (i.e. http or mailto URL) how to access help for the mailing list.
list-id-context-list-help =
  .label = Get Help
  .accesskey = H

# Describes (i.e. http or mailto URL) how to unsubscribe for the mailing list.
list-id-list-unsubscribe =
  .label = Unsubscribe…
  .accesskey = U

# Describes (i.e. http or mailto URL) how to (re)subscribe to the mailing list.
list-id-list-subscribe =
  .label = Subscribe…
  .accesskey = S

# Describes (i.e. http or mailto URL) how to post to the mailing list.
list-id-list-post =
  .label = Write
  .accesskey = W

# Describes (i.e. http or mailto URL) how to contact the admin of the mailing list.
list-id-list-owner =
  .label = Contact Administrator…
  .accesskey = C

# Describes (i.e. http or mailto URL) how to access archives for the mailing list.
list-id-list-archive =
  .label = List Archives
  .accesskey = A

# Direct link to the archived form of an individual email message. RFC 5064.
list-id-archived-at =
  .label = Message Permalink
  .accesskey = P

# An additional email header field that the user has chosen to display. Unlike
# the other headers, the name of this header is not expected to be localised
# because it is generated from the raw field name found in the email header.
#   $fieldName (String) - The field name.
message-header-custom-field = { $fieldName }<span data-l10n-name="field-separator">:</span>

##

message-header-address-in-address-book-icon2 =
  .alt = In the Address Book

message-header-address-not-in-address-book-icon2 =
  .alt = Not in the Address Book

message-header-address-not-in-address-book-button =
    .title = Save this address in the Address Book

message-header-address-in-address-book-button =
    .title = Edit contact

message-header-field-show-more = More
    .title = Show all recipients

message-ids-field-show-all = Show all

## Dark Message Mode

dark-message-mode-toggle-enabled =
  .title = Disable dark message mode

dark-message-mode-toggle-disabled =
  .title = Enable dark message mode
