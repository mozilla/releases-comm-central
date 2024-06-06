# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# LOCALIZATION NOTE (matrix-username-hint):
#  This is displayed inside the accountUsernameInfoWithDescription
#  string defined in imAccounts.properties when the user is
#  configuring a Matrix account.
matrix-username-hint = Matrix ID

# LOCALIZATION NOTE (options-*):
#   These are the protocol specific options shown in the account manager and
#   account wizard windows.
options-save-token = Store access token
options-device-display-name = Device display name
options-homeserver = Server
options-backup-passphrase = Key Backup Passphrase

# LOCALIZATION NOTE (options-encryption-*):
#   These are strings used to build the status information of the encryption
#   storage, shown in the account manager. $status (String) is one of the statuses and the
#   strings are combined with a pipe (|) between.
options-encryption-enabled = Cryptographic Functions: { $status }
# $status (String) a status
options-encryption-secret-storage = Secret Storage: { $status }
# $status (String) a status
options-encryption-key-backup = Encryption Key Backup: { $status }
# $status (String) a status
options-encryption-cross-signing = Cross Signing: { $status }
options-encryption-status-ok = ok
options-encryption-status-not-ok = not ready
options-encryption-need-backup-passphrase = Please enter your backup key passphrase in the protocol options.
options-encryption-set-up-secret-storage = To set up secret storage, please use another client and afterwards enter the generated backup key passphrase in the “General” tab.
options-encryption-set-up-backup-and-cross-signing = To activate encryption key backups and cross signing, enter your backup key passphrase in the “General” tab or verify the identity of one of the sessions below.
# $sessionId (String) is the session ID, $sessionDisplayName (String) is the session display name
options-encryption-session = { $sessionId } ({ $sessionDisplayName })

# LOCALIZATION NOTE (connection-*):
#   These will be displayed in the account manager in order to show the progress
#   of the connection.
#   (These will be displayed in account.connection.progress from
#    accounts.properties, which adds … at the end, so do not include
#    periods at the end of these messages.)
connection-request-auth = Waiting for your authorization
connection-request-access = Finalizing authentication

# LOCALIZATION NOTE (connection-error-*):
#   These will show in the account manager if an error occurs during the
#   connection attempt.
connection-error-no-supported-flow = Server offers no compatible login flow.
connection-error-auth-cancelled = You cancelled the authorization process.
connection-error-session-ended = Session was logged out.
connection-error-server-not-found = Could not identify the Matrix server for the given Matrix account.

# LOCALIZATION NOTE (chat-room-field-*):
#   These are the name of fields displayed in the 'Join Chat' dialog
#   for Matrix accounts.
#   The _ character won't be displayed; it indicates the next
#   character of the string should be used as the access key for this
#   field.
chat-room-field-room = _Room

# LOCALIZATION NOTE (tooltip-*):
#    These are the descriptions given in a tooltip with information received
#    from the "User" object.
# The human readable name of the user.
tooltip-display-name = Display name
# $timespan (String) is the timespan elapsed since the last activity.
tooltip-timespan = { $timespan } ago
tooltip-last-active = Last activity

# LOCALIZATION NOTE (power-level-*):
#    These are the string representations of different standard power levels and strings.
#    $powerLevelName (String) are one of the power levels, Default/Moderator/Admin/Restricted/Custom.
#    $powerLevelName (String) is the power level name
#    $powerLevelNumber (String) is the power level number
power-level-default = Default
power-level-moderator = Moderator
power-level-admin = Admin
power-level-restricted = Restricted
power-level-custom = Custom
#    $powerLevelName is the power level name
#    $powerLevelNumber is the power level number
power-level-detailed = { $powerLevelName } ({ $powerLevelNumber })
#    $powerLevelName is the power level name
power-level-default-role = Default role: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-invite-user = Invite users: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-kick-users = Kick users: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-ban = Ban users: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-room-avatar = Change room avatar: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-main-address = Change main address for the room: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-history = Change history visibility: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-room-name = Change room name: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-change-permissions = Change permissions: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-server-acl = Send m.room.server_acl events: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-upgrade-room = Upgrade the room: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-remove = Remove messages: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-events-default = Events default: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-state-default = Change setting: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-encryption = Enable Room encryption: { $powerLevelName }
#    $powerLevelName is the power level name
power-level-topic = Set room topic: { $powerLevelName }

# LOCALIZATION NOTE (detail-*):
#    These are the string representations of different matrix properties.
#    $value will typically be strings with the actual values.
# $value Example placeholder: "Foo bar"
detail-name = Name: { $value }
# $value Example placeholder: "My first room"
detail-topic = Topic: { $value }
# $value Example placeholder: "5"
detail-version = Room Version: { $value }
# $value Example placeholder: "#thunderbird:mozilla.org"
detail-room-id = RoomID: { $value }
# $value are all admin users. Example: "@foo:example.com, @bar:example.com"
detail-admin = Admin: { $value }
# $value are all moderators. Example: "@lorem:mozilla.org, @ipsum:mozilla.org"
detail-moderator = Moderator: { $value }
# $value Example placeholder: "#thunderbird:matrix.org"
detail-alias = Alias: { $value }
# $value Example placeholder: "can_join"
detail-guest = Guest Access: { $value }
# This is a heading, followed by the power-level-* strings
detail-power = Power Levels:

# LOCALIZATION NOTE (command-*):
#   These are the help messages for each command, the $commandName is the command name
#   Each command first gives the parameter it accepts and then a description of
#   the command.
command-ban = { $commandName } &lt;userId&gt; [&lt;reason&gt;]: Ban the user with the userId from the room with optional reason message. Requires permission to ban users.
# $commandName is the command name
command-invite = { $commandName } &lt;userId&gt;: Invite the user to the room.
# $commandName is the command name
command-kick = { $commandName } &lt;userId&gt; [&lt;reason&gt;]: Kick the user with the userId from the room with optional reason message. Requires permission to kick users.
# $commandName is the command name
command-nick = { $commandName } &lt;display_name&gt;: Change your display name.
# $commandName is the command name
command-op = { $commandName } &lt;userId&gt; [&lt;power level&gt;]: Define the power level of the user. Enter an integer value, User: 0, Moderator: 50 and Admin: 100. Default will be 50 if no argument is provided. Requires permission to change member’s power levels. Does not work on admins other than yourself.
# $commandName is the command name
command-deop = { $commandName } &lt;userId&gt;: Reset the user to power level 0 (User). Requires permission to change member’s power levels. Does not work on admins other than yourself.
# $commandName is the command name
command-leave = { $commandName }: Leave the current room.
# $commandName is the command name
command-topic = { $commandName } &lt;topic&gt;: Set the topic for the room. Requires permissions to change the room topic.
# $commandName is the command name
command-unban = { $commandName } &lt;userId&gt;: Unban a user who is banned from the room. Requires permission to ban users.
# $commandName is the command name
command-visibility = { $commandName } [&lt;visibility&gt;]: Set the visibility of the current room in the current Home Server’s room directory. Enter an integer value, Private: 0 and Public: 1. Default will be Private (0) if no argument is provided. Requires permission to change room visibility.
# $commandName is the command name
command-guest = { $commandName } &lt;guest access&gt; &lt;history visibility&gt;: Set the access and history visibility of the current room for the guest users. Enter two integer values, the first for the guest access (not allowed: 0 and allowed: 1) and the second for the history visibility (not visible: 0 and visible: 1). Requires permission to change history visibility.
# $commandName is the command name
command-roomname = { $commandName } &lt;name&gt;: Set the name for the room. Requires permission to change the room name.
# $commandName is the command name
command-detail = { $commandName }: Display the details of the room.
# $commandName is the command name
command-addalias = { $commandName } &lt;alias&gt;: Create an alias for the room. Expected room alias of the form ‘#localname:domain’. Requires permission to add aliases.
# $commandName is the command name
command-removealias = { $commandName } &lt;alias&gt;: Remove the alias for the room. Expected room alias of the form ‘#localname:domain’. Requires permission to remove aliases.
# $commandName is the command name
command-upgraderoom = { $commandName } &lt;newVersion&gt;: Upgrade room to given version. Requires permission to upgrade the room.
# $commandName is the command name
command-me = { $commandName } &lt;action&gt;: Perform an action.
# $commandName is the command name
command-msg = { $commandName } &lt;userId&gt; &lt;message&gt;: Send a direct message to the given user.
# $commandName is the command name
command-join = { $commandName } &lt;roomId&gt;: Join the given room.

# LOCALIZATION NOTE (message-*):
#    These are shown as system messages in the conversation.
#    $user is the name of the user who banned.
#    $userBanned is the name of the user who got banned.
message-banned = { $user } banned { $userBanned }.
#    $user is the name of the user who banned.
#    $userBanned is the name of the user who got banned.
#    $reason is the reason the user was banned.
message-banned-with-reason = { $user } banned { $userBanned }. Reason: { $reason }
#    $user is the name of the user who accepted the invitation.
#    $userWhoSent is the name of the user who sent the invitation.
message-accepted-invite-for = { $user } accepted the invitation for { $userWhoSent }.
#    $user is the name of the user who accepted an invitation.
message-accepted-invite = { $user } accepted an invitation.
#    $user is the name of the user who invited.
#    $userWhoGotInvited is the name of the user who got invited.
message-invited = { $user } invited { $userWhoGotInvited }.
#    $user is the name of the user who changed their display name.
#    $oldDisplayName is the old display name.
#    $newDisplayName is the new display name.
message-display-name-changed = { $user } changed their display name from { $oldDisplayName } to { $newDisplayName }.
#    $user is the name of the user who set their display name.
#    $changedName is the newly set display name.
message-display-name-set = { $user } set their display name to { $changedName }.
#    $user is the name of the user who removed their display name.
#    $nameRemoved is the old display name which has been removed.
message-display-name-remove = { $user } removed their display name { $nameRemoved }.
#    $user is the name of the user who has joined the room.
message-joined = { $user } has joined the room.
#    $user is the name of the user who has rejected the invitation.
message-rejected-invite = { $user } has rejected the invitation.
#    $user is the name of the user who has left the room.
message-left = { $user } has left the room.
#    $user is the name of the user who unbanned.
#    $userUnbanned is the name of the user who got unbanned.
message-unbanned = { $user } unbanned { $userUnbanned }.
#    $user is the name of the user who kicked.
#    $userGotKicked is the name of the user who got kicked.
message-kicked = { $user } kicked { $userGotKicked }.
#    $user is the name of the user who kicked.
#    $userGotKicked is the name of the user who got kicked.
#    $reason is the reason for the kick.
message-kicked-with-reason = { $user } kicked { $userGotKicked }. Reason: { $reason }
#    $user is the name of the user who withdrew invitation.
#    $userInvitationWithdrawn is the name of the user whose invitation has been withdrawn.
message-withdrew-invite = { $user } withdrew { $userInvitationWithdrawn }’s invitation.
#    $user is the name of the user who withdrew invitation.
#    $userInvitationWithdrawn is the name of the user whose invitation has been withdrawn.
#    $reason is the reason the invite was withdrawn.
message-withdrew-invite-with-reason = { $user } withdrew { $userInvitationWithdrawn }’s invitation. Reason: { $reason }
#    $user is the name of the user who has removed the room name.
message-room-name-remove = { $user } removed the room name.
#    $user is the name of the user who changed the room name.
#    $newRoomName is the new room name.
message-room-name-changed = { $user } changed the room name to { $newRoomName }.
#    $user is the name of the user who changed the power level.
#    $powerLevelChanges is a list of "message-power-level-from-to" strings representing power level changes separated by commas
#    power level changes, separated by commas if  there are multiple changes.
message-power-level-changed = { $user } changed the power level of { $powerLevelChanges }.
#    $user is the name of the target user whose power level has been changed.
#    $oldPowerLevel is the old power level.
#    $newPowerLevel is the new power level.
message-power-level-from-to = { $user } from { $oldPowerLevel } to { $newPowerLevel }
#    $user is the name of the user who has allowed guests to join the room.
message-guest-allowed = { $user } has allowed guests to join the room.
#    $user is the name of the user who has prevented guests to join the room.
message-guest-prevented = { $user } has prevented guests from joining the room.
#    $user is the name of the user who has made future room history visible to anyone.
message-history-anyone = { $user } made future room history visible to anyone.
#    $user is the name of the user who has made future room history visible to all room members.
message-history-shared = { $user } made future room history visible to all room members.
#    $user is the name of the user who has made future room history visible to all room members, from the point they are invited.
message-history-invited = { $user } made future room history visible to all room members, from the point they are invited.
#    $user is the name of the user who has made future room history visible to all room members, from the point they joined.
message-history-joined = { $user } made future room history visible to all room members, from the point they joined.
#    $user is the name of the user who changed the address.
#    $oldAddress is the old address.
#    $newAddress is the new address.
message-alias-main = { $user } set the main address for this room from { $oldAddress } to { $newAddress }.
#    $user is the name of the user who added the address.
#    $addresses is a comma delimited list of added addresses.
message-alias-added = { $user } added { $addresses } as alternative address  for this room.
#    $user is the name of the user who removed the address.
#    $addresses is a comma delimited list of removed addresses.
message-alias-removed = { $user } removed { $addresses } as alternative address for this room.
#    $user is the name of the user that edited the alias addresses.
#    $removedAddresses is a comma delimited list of removed addresses.
#    $addedAddresses is a comma delmited list of added addresses.
message-alias-removed-and-added = { $user } removed { $removedAddresses } and added { $addedAddresses } as address for this room.
message-space-not-supported = This room is a space, which is not supported.
message-encryption-start = Messages in this conversation are now end-to-end encrypted.
#    $user is the name of the user who sent the verification request.
#    $userReceiving is the name of the user that is receiving the verification request.
message-verification-request2 = { $user } wants to verify { $userReceiving }.
#    $user is the name of the user who cancelled the verification request.
#    $reason is the reason given why the verification was cancelled.
message-verification-cancel2 = { $user } cancelled the verification with the reason: { $reason }
message-verification-done = Verification completed.
message-decryption-error = Could not decrypt the contents of this message. To request encryption keys from your other devices, right click this message.
message-decrypting = Decrypting…
message-redacted = Message was redacted.
#    $userThatReacted is the username of the user that reacted.
#    $userThatSentMessage is the username of the user that sent the message the reaction was added to.
#    $reaction is the content (typically an emoji) of the reaction.
message-reaction = { $userThatReacted } reacted to { $userThatSentMessage } with { $reaction }.

#    Label in the message context menu
message-action-request-key = Re-request Keys
message-action-redact = Redact
message-action-report = Report Message
message-action-retry = Retry Sending
message-action-cancel = Cancel Message

# LOCALIZATION NOTE (error-*)
#    These are strings shown as system messages when an action the user took fails.
#    $message is the message.
error-send-message-failed = An error occurred while sending your message “{ $message }”.
