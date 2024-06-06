# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# LOCALIZATION NOTE (connection-*)
#   These will be displayed in the account manager in order to show the progress
#   of the connection.
#   (These will be displayed in account.connection.progress from
#    accounts.properties, which adds … at the end, so do not include
#    periods at the end of these messages.)
connection-initializing-stream = Initializing stream
connection-initializing-encryption = Initializing encryption
connection-authenticating = Authenticating
connection-getting-resource = Getting resource
connection-downloading-roster = Downloading contact list
connection-srv-lookup = Looking up the SRV record

# LOCALIZATION NOTE (connection-error-*)
#   These will show in the account manager if an error occurs during the
#   connection attempt.
connection-error-invalid-username = Invalid username (your username should contain an ‘@’ character)
connection-error-failed-to-create-a-socket = Failed to create a socket (Are you offline?)
connection-error-server-closed-connection = The server closed the connection
connection-error-reset-by-peer = Connection reset by peer
connection-error-timed-out = The connection timed out
connection-error-received-unexpected-data = Received unexpected data
connection-error-incorrect-response = Received an incorrect response
connection-error-start-tls-required = The server requires encryption but you disabled it
connection-error-start-tls-not-supported = The server doesn’t support encryption but your configuration requires it
connection-error-failed-to-start-tls = Failed to start encryption
connection-error-no-auth-mec = No authentication mechanism offered by the server
connection-error-no-compatible-auth-mec = None of the authentication mechanisms offered by the server are supported
connection-error-not-sending-password-in-clear = The server only supports authentication by sending the password in cleartext
connection-error-authentication-failure = Authentication failure
connection-error-not-authorized = Not authorized (Did you enter the wrong password?)
connection-error-failed-to-get-a-resource = Failed to get a resource
connection-error-failed-max-resource-limit = This account is connected from too many places at the same time.
connection-error-failed-resource-not-valid = Resource is not valid.
connection-error-xmpp-not-supported = This server does not support XMPP

# LOCALIZATION NOTE (conversation-error-not-delivered):
#   This is displayed in a conversation as an error message when a message
#   the user has sent wasn't delivered.
#   $message is replaced by the text of the message that wasn't delivered.
conversation-error-not-delivered = This message could not be delivered: { $message }
#   This is displayed in a conversation as an error message when joining a MUC
#   fails.
#   $mucName is the name of the MUC.
conversation-error-join-failed = Could not join: { $mucName }
#   This is displayed in a conversation as an error message when the user is
#   banned from a room.
#   $mucName is the name of the MUC room.
conversation-error-join-forbidden = Couldn’t join { $mucName } as you are banned from this room.
conversation-error-join-failed-not-authorized = Registration required: You are not authorized to join this room.
conversation-error-creation-failed-not-allowed = Access restricted: You are not allowed to create rooms.
#   This is displayed in a conversation as an error message when remote server
#   is not found.
#   $mucName is the name of MUC room.
conversation-error-join-failed-remote-server-not-found = Could not join the room { $mucName } as the server the room is hosted on could not be reached.
conversation-error-change-topic-failed-not-authorized = You are not authorized to set the topic of this room.
#   This is displayed in a conversation as an error message when the user sends
#   a message to a room that he is not in.
#   $mucName is the name of MUC room.
#   $message is the text of the message that wasn't delivered.
conversation-error-send-failed-as-not-inroom = Message could not be sent to { $mucName } as you are no longer in the room: { $message }
#   This is displayed in a conversation as an error message when the user sends
#   a message to a room that the recipient is not in.
#   $jabberIdentifier is the jid of the recipient.
#   $message is the text of the message that wasn't delivered.
conversation-error-send-failed-as-recipient-not-inroom = Message could not be sent to { $jabberIdentifier } as the recipient is no longer in the room: { $message }
#   These are displayed in a conversation as a system error message.
conversation-error-remote-server-not-found = Could not reach the recipient’s server.
conversation-error-unknown-send-error = An unknown error occurred on sending this message.
#   $nick is the name of the message recipient.
conversation-error-send-service-unavailable = It is not possible to send messages to { $nick } at this time.

#   $nick is the nick of participant that is not in room.
conversation-error-nick-not-in-room = { $nick } is not in the room.
conversation-error-ban-command-anonymous-room = You can’t ban participants from anonymous rooms. Try /kick instead.
conversation-error-ban-kick-command-not-allowed = You don’t have the required privileges to remove this participant from the room.
conversation-error-ban-kick-command-conflict = Sorry, you can’t remove yourself from the room.
#   $nick is the nick of participant that is not in room.
conversation-error-change-nick-failed-conflict = Could not change your nick to { $nick } as this nick is already in use.
#   $nick is a nick that cannot be set
conversation-error-change-nick-failed-not-acceptable = Could not change your nick to { $nick } as nicks are locked down in this room.
conversation-error-invite-failed-forbidden = You don’t have the required privileges to invite users to this room.
#   $jabberIdentifier (String) is the jid of user that is invited.
conversation-error-failed-jid-not-found = Could not reach { $jabberIdentifier }.
#   $jabberIdentifier (String) is the jid that is invalid.
conversation-error-invalid-jid = { $jabberIdentifier } is an invalid jid (Jabber identifiers must be of the form user@domain).
conversation-error-command-failed-not-in-room = You have to rejoin the room to be able to use this command.
#   $recipient (String) is the name of the recipient.
conversation-error-resource-not-available = You must talk first as { $recipient } could be connected with more than one client.

# LOCALIZATION NOTE (conversation-error-version-*):
#   $recipient is the name of the recipient.
conversation-error-version-unknown = { $recipient }’s client does not support querying for its software version.

# LOCALIZATION NOTE (tooltip-*):
#   These are the titles of lines of information that will appear in
#   the tooltip showing details about a contact or conversation.
# LOCALIZATION NOTE (tooltip-status):
#   $resourceIdentifier (String) will be replaced by the XMPP resource identifier
tooltip-status = Status ({ $resourceIdentifier })
tooltip-status-no-resource = Status
tooltip-subscription = Subscription
tooltip-full-name = Full Name
tooltip-nickname = Nickname
tooltip-email = Email
tooltip-birthday = Birthday
tooltip-user-name = Username
tooltip-title = Title
tooltip-organization = Organization
tooltip-locality = Locality
tooltip-country = Country
tooltip-telephone = Telephone number

# LOCALIZATION NOTE (chat-room-field-*):
#   These are the name of fields displayed in the 'Join Chat' dialog
#   for XMPP accounts.
#   The _ character won't be displayed; it indicates the next
#   character of the string should be used as the access key for this
#   field.
chat-room-field-room = _Room
chat-room-field-server = _Server
chat-room-field-nick = _Nick
chat-room-field-password = _Password

# LOCALIZATION NOTE (conversation-muc-*):
#   These are displayed as a system message when a chatroom invitation is
#   received.
#   $inviter is the inviter.
#   $room is the room.
#   $reason is the reason which is a message provided by the person sending the
#   invitation.
conversation-muc-invitation-with-reason2 = { $inviter } has invited you to join { $room }: { $reason }


#   $inviter is the inviter.
#   $room is the room.
#   $password is the password of the room.
#   $reason is the reason which is a message provided by the person sending the
#   invitation.
conversation-muc-invitation-with-reason2-password = { $inviter } has invited you to join { $room } with password { $password }: { $reason }
#   $inviter is the inviter.
#   $room is the room.
conversation-muc-invitation-without-reason = { $inviter } has invited you to join { $room }
#   $inviter is the inviter.
#   $room is the room.
#   $password is the password of the room.
conversation-muc-invitation-without-reason-password = { $inviter } has invited you to join { $room } with password { $password }

# LOCALIZATION NOTE (conversation-message-join):
#   This is displayed as a system message when a participant joins room.
#   $participant is the nick of the participant.
conversation-message-join = { $participant } entered the room.

# LOCALIZATION NOTE (conversation-message-rejoined):
#   This is displayed as a system message when a participant rejoins room after
#   parting it.
conversation-message-rejoined = You have rejoined the room.

# LOCALIZATION NOTE (conversation-message-parted-*):
#   These are displayed as a system message when a participant parts a room.
#   $message is the part message supplied by the user.
conversation-message-parted-you = You have left the room.
#   $message is the part message supplied by the user.
conversation-message-parted-you-reason = You have left the room: { $message }
#   $participant is the participant that is leaving.
conversation-message-parted = { $participant } has left the room.
#   $participant is the participant that is leaving.
#   $message is the part message supplied by the participant.
conversation-message-parted-reason = { $participant } has left the room: { $message }

# LOCALIZATION NOTE (conversation-message-invitation-declined*):
#   $invitee (String) is the invitee that declined the invitation.
conversation-message-invitation-declined = { $invitee } has declined your invitation.
#   $invitee (String) is the invitee that declined the invitation.
#   $declineMessage (String) is the decline message supplied by the invitee.
conversation-message-invitation-declined-reason = { $invitee } has declined your invitation: { $declineMessage }

# LOCALIZATION NOTE (conversation-message-banned-*):
#   These are displayed as a system message when a participant is banned from
#   a room.
#   $affectedNick (String) is the participant that is banned.
conversation-message-banned = { $affectedNick } has been banned from the room.
#   $affectedNick (String) is the participant that is banned.
#   $reason (String) is the reason.
conversation-message-banned-reason = { $affectedNick } has been banned from the room: { $reason }
#   $actorNick (String) is the person who is banning.
#   $affectedNick (String) is the participant that is banned.
conversation-message-banned-actor = { $actorNick } has banned { $affectedNick } from the room.
#   $actorNick (String) is the person who is banning.
#   $affectedNick (String) is the participant that is banned.
#   $reason (String) is the reason.
conversation-message-banned-actor-reason = { $actorNick } has banned { $affectedNick } from the room: { $reason }
conversation-message-banned-you = You have been banned from the room.
#   $reason (String) is the reason.
conversation-message-banned-you-reason = You have been banned from the room: { $reason }
#   $actorNick (String) is the person who is banning.
conversation-message-banned-you-actor = { $actorNick } has banned you from the room.
#   $actorNick (String) is the person who is banning.
#   $reason (String) is the reason.
conversation-message-banned-you-actor-reason = { $actorNick } has banned you from the room: { $reason }

# LOCALIZATION NOTE (conversation-message-kicked-*):
#   These are displayed as a system message when a participant is kicked from
#   a room.
#   $affectedNick (String) is the participant that is kicked.
conversation-message-kicked = { $affectedNick } has been kicked from the room.
#   $affectedNick (String) is the participant that is kicked.
#   $reason (String) is the reason.
conversation-message-kicked-reason = { $affectedNick } has been kicked from the room: { $reason }
#   $actorNick (String) is the person who is kicking.
#   $affectedNick (String) is the participant that is kicked.
conversation-message-kicked-actor = { $actorNick } has kicked { $affectedNick } from the room.
#   $actorNick (String) is the person who is kicking.
#   $affectedNick (String) is the participant that is kicked.
#   $reason (String) is the reason.
conversation-message-kicked-actor-reason = { $actorNick } has kicked { $affectedNick } from the room: { $reason }
conversation-message-kicked-you = You have been kicked from the room.
#   $reason (String) is the reason.
conversation-message-kicked-you-reason = You have been kicked from the room: { $reason }
#   $actorNick (String) is the person who is kicking.
conversation-message-kicked-you-actor = { $actorNick } has kicked you from the room.
#   $actorNick (String) is the person who is kicking.
#   $reason (String) is the reason.
conversation-message-kicked-you-actor-reason = { $actorNick } has kicked you from the room: { $reason }

# LOCALIZATION NOTE (conversation-message-removed-non-member-*):
#   These are displayed as a system message when a participant is removed from
#   a room because the room has been changed to members-only.
#   $affectedNick is the participant that is removed.
conversation-message-removed-non-member = { $affectedNick } has been removed from the room because its configuration was changed to members-only.
#   $affectedNick (String): is the participant that is removed.
#   $actorNick (String): is the person who changed the room configuration.
conversation-message-removed-non-member-actor = { $affectedNick } has been removed from the room because { $actorNick } has changed it to members-only.
conversation-message-removed-non-member-you = You have been removed from the room because its configuration has been changed to members-only.
#   $actorNick (String) is the person who changed the room configuration.
conversation-message-removed-non-member-you-actor = You have been removed from the room because { $actorNick } has changed it to members-only.

# LOCALIZATION NOTE (conversation.message-muc-shutdown):
#   These are displayed as a system message when a participant is removed from
#   a room because of a system shutdown.
conversation-message-muc-shutdown = You have been removed from the room because of a system shutdown.

# LOCALIZATION NOTE (conversation-message-version*):
#   $user (String): is the name of the user whose version was requested.
#   $clientName (String): is the client name response from the client.
#   $clientVersion (String): is the client version response from the client.
conversation-message-version = { $user } is using “{ $clientName } { $clientVersion }”.
#   $user (String): is the name of the user whose version was requested.
#   $clientName (String): is the client name response from the client.
#   $clientVersion (String): is the client version response from the client.
#   $systemResponse (String): is the operating system(OS) response from the client.
conversation-message-version-with-os = { $user } is using “{ $clientName } { $clientVersion }” on { $systemResponse }.

# LOCALIZATION NOTE (options-*):
#   These are the protocol specific options shown in the account manager and
#   account wizard windows.
options-resource = Resource
options-priority = Priority
options-connection-security = Connection security
options-connection-security-require-encryption = Require encryption
options-connection-security-opportunistic-tls = Use encryption if available
options-connection-security-allow-unencrypted-auth = Allow sending the password unencrypted
options-connect-server = Server
options-connect-port = Port
options-domain = Domain

# LOCALIZATION NOTE (*-protocol-name)
#  This name is used whenever the name of the protocol is shown.
gtalk-protocol-name = Google Talk
odnoklassniki-protocol-name = Odnoklassniki

# LOCALIZATION NOTE (gtalk-disabled):
#  Google Talk was disabled on June 16, 2022. The message below is a localized
#  error message to be displayed to users with Google Talk accounts.
gtalk-disabled = Google Talk is no longer supported due to Google disabling their XMPP gateway.

# LOCALIZATION NOTE (odnoklassniki-username-hint):
#  This is displayed inside the accountUsernameInfoWithDescription
#  string defined in imAccounts.properties when the user is
#  configuring a Odnoklassniki account.
odnoklassniki-username-hint = Profile ID

# LOCALIZATION NOTE (command-*):
#  These are the help messages for each command.
# $commandName (String): command name
command-join3 = { $commandName } [&lt;room&gt;[@&lt;server&gt;][/&lt;nick&gt;]] [&lt;password&gt;]: Join a room, optionally providing a different server, or nickname, or the room password.
# $commandName (String): command name
command-part2 = { $commandName } [&lt;message&gt;]: Leave the current room with an optional message.
# $commandName (String): command name
command-topic = { $commandName } [&lt;new topic&gt;]: Set this room’s topic.
# $commandName (String): command name
command-ban = { $commandName } &lt;nick&gt;[&lt;message&gt;]: Ban someone from the room. You must be a room administrator to do this.
# $commandName (String): command name
command-kick = { $commandName } &lt;nick&gt;[&lt;message&gt;]: Remove someone from the room. You must be a room moderator to do this.
# $commandName (String): command name
command-invite = { $commandName } &lt;jid&gt;[&lt;message&gt;]: Invite a user to join the current room with an optional message.
# $commandName (String): command name
command-inviteto = { $commandName } &lt;room jid&gt;[&lt;password&gt;]: Invite your conversation partner to join a room, together with its password if required.
# $commandName (String): command name
command-me = { $commandName } &lt;action to perform&gt;: Perform an action.
# $commandName (String): command name
command-nick = { $commandName } &lt;new nickname&gt;: Change your nickname.
# $commandName (String): command name
command-msg = { $commandName } &lt;nick&gt; &lt;message&gt;: Send a private message to a participant in the room.
# $commandName (String): command name
command-version = { $commandName }: Request information about the client your conversation partner is using.
