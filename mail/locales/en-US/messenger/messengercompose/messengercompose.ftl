# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Addressing widget

#   $type (String) - the type of the addressing row
remove-address-row-type-label =
    .tooltiptext = Remove the { $type } field

#   $type (String) - the type of the addressing row
#   $count (Number) - the number of address pills currently present in the addressing row
address-input-type-aria-label = { $count ->
    [0]     { $type }
    [one]   { $type } with one address, use left arrow key to focus on it.
    *[other] { $type } with { $count } addresses, use left arrow key to focus on them.
}

#   $email (String) - the email address
#   $count (Number) - the number of address pills currently present in the addressing row
pill-aria-label = { $count ->
    [one]   { $email }: press Enter to edit, Delete to remove.
    *[other] { $email }, 1 of { $count }: press Enter to edit, Delete to remove.
}

#   $email (String) - the email address
pill-tooltip-invalid-address = { $email } is not a valid e-mail address

#   $email (String) - the email address
pill-tooltip-not-in-address-book = { $email } is not in your address book

pill-action-edit =
    .label = Edit Address
    .accesskey = E

pill-action-move-to =
    .label = Move to To
    .accesskey = T

pill-action-move-cc =
    .label = Move to Cc
    .accesskey = C

pill-action-move-bcc =
    .label = Move to Bcc
    .accesskey = B

# Attachment widget

ctrl-cmd-shift-pretty-prefix = {
  PLATFORM() ->
    [macos] ⇧ ⌘{" "}
   *[other] Ctrl+Shift+
}

trigger-attachment-picker-key = A
toggle-attachment-pane-key = M

menuitem-toggle-attachment-pane =
    .label = Attachment Pane
    .accesskey = m
    .acceltext = { ctrl-cmd-shift-pretty-prefix }{ toggle-attachment-pane-key }

toolbar-button-add-attachment =
    .label = Attach
    .tooltiptext = Add an Attachment ({ ctrl-cmd-shift-pretty-prefix }{ trigger-attachment-picker-key })

add-attachment-notification-reminder =
    .label = Add Attachment…
    .tooltiptext = { toolbar-button-add-attachment.tooltiptext }

menuitem-attach-files =
    .label = File(s)…
    .accesskey = F
    .acceltext = { ctrl-cmd-shift-pretty-prefix }{ trigger-attachment-picker-key }

context-menuitem-attach-files =
    .label = Attach File(s)…
    .accesskey = F
    .acceltext = { ctrl-cmd-shift-pretty-prefix }{ trigger-attachment-picker-key }

#   $count (Number) - the number of attachments in the attachment bucket
attachment-bucket-count =
    .value = { $count ->
        [1]      { $count } Attachment
        *[other] { $count } Attachments
    }

expand-attachment-pane-tooltip =
    .tooltiptext = Show the attachment pane ({ ctrl-cmd-shift-pretty-prefix }{ toggle-attachment-pane-key })

collapse-attachment-pane-tooltip =
    .tooltiptext = Hide the attachment pane ({ ctrl-cmd-shift-pretty-prefix }{ toggle-attachment-pane-key })

drop-file-label-attachment = { $count ->
    [one]   Add as Attachment
   *[other] Add as Attachments
}

drop-file-label-inline = { $count ->
    [one]   Append inline
   *[other] Append inline
}

# Reorder Attachment Panel

move-attachment-first-panel-button =
    .label = Move First
move-attachment-left-panel-button =
    .label = Move Left
move-attachment-right-panel-button =
    .label = Move Right
move-attachment-last-panel-button =
    .label = Move Last

button-return-receipt =
    .label = Receipt
    .tooltiptext = Request a return receipt for this message
