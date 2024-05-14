# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

replacements_commandName = dict({"%1$S": VARIABLE_REFERENCE("commandName")})
replacements_invitee = dict({"%1$S": VARIABLE_REFERENCE("invitee")})
replacements_invitee_declineMessage = dict(
    {"%1$S": VARIABLE_REFERENCE("invitee"), "%2$S": VARIABLE_REFERENCE("declineMessage")}
)
replacements_inviter_room = dict(
    {"%1$S": VARIABLE_REFERENCE("inviter"), "%2$S": VARIABLE_REFERENCE("room")}
)
replacements_affectedNick_reason = dict(
    {"%1$S": VARIABLE_REFERENCE("affectedNick"), "%2$S": VARIABLE_REFERENCE("reason")}
)
replacements_inviter_room_password = dict(
    {
        "%1$S": VARIABLE_REFERENCE("inviter"),
        "%2$S": VARIABLE_REFERENCE("room"),
        "%3$S": VARIABLE_REFERENCE("password"),
    }
)
eplacements_affectedNick_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("affectedNick"),
        "%2$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_inviter_room_password_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("inviter"),
        "%2$S": VARIABLE_REFERENCE("room"),
        "%3$S": VARIABLE_REFERENCE("password"),
        "%4$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_inviter_room_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("inviter"),
        "%2$S": VARIABLE_REFERENCE("room"),
        "%3$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_jabberIdentifier = dict({"%1$S": VARIABLE_REFERENCE("jabberIdentifier")})
replacements_jabberIdentifier_message = dict(
    {"%1$S": VARIABLE_REFERENCE("jabberIdentifier"), "%2$S": VARIABLE_REFERENCE("message")}
)
replacement_affectedNick = dict({"%1$S": VARIABLE_REFERENCE("affectedNick")})
replacement_affectedNick_reason = dict(
    {"%1$S": VARIABLE_REFERENCE("affectedNick"), "%2$S": VARIABLE_REFERENCE("reason")}
)
replacements_actorNick = dict({"%1$S": VARIABLE_REFERENCE("actorNick")})
replacements_actorNick_affectedNick = dict(
    {"%1$S": VARIABLE_REFERENCE("actorNick"), "%2$S": VARIABLE_REFERENCE("affectedNick")}
)
replacements_actorNick_affectedNick_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("actorNick"),
        "%2$S": VARIABLE_REFERENCE("affectedNick"),
        "%3$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_actorNick = dict({"%1$S": VARIABLE_REFERENCE("actorNick")})
replacements_actorNick_reason = dict(
    {"%1$S": VARIABLE_REFERENCE("actorNick"), "%2$S": VARIABLE_REFERENCE("reason")}
)
replacements_message = dict({"%1$S": VARIABLE_REFERENCE("message")})
replacements_mucName = dict({"%1$S": VARIABLE_REFERENCE("mucName")})
replacements_mucName_message = dict(
    {"%1$S": VARIABLE_REFERENCE("mucName"), "%2$S": VARIABLE_REFERENCE("message")}
)
replacements_nick = dict({"%1$S": VARIABLE_REFERENCE("nick")})
replacements_participant = dict({"%1$S": VARIABLE_REFERENCE("participant")})
replacements_participant_message = dict(
    {"%1$S": VARIABLE_REFERENCE("participant"), "%2$S": VARIABLE_REFERENCE("message")}
)
replacements_participant_reason = dict(
    {"%1$S": VARIABLE_REFERENCE("participant"), "%2$S": VARIABLE_REFERENCE("reason")}
)
replacements_actorNick = dict({"%1$S": VARIABLE_REFERENCE("actorNick")})
replacements_actorNick_affectedNick = dict(
    {"%1$S": VARIABLE_REFERENCE("actorNick"), "%2$S": VARIABLE_REFERENCE("affectedNick")}
)
replacements_affectedNick = dict({"%1$S": VARIABLE_REFERENCE("affectedNick")})
replacements_actorNick_affectedNick_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("actorNick"),
        "%2$S": VARIABLE_REFERENCE("affectedNick"),
        "%3$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_actorNick_reason = dict(
    {"%1$S": VARIABLE_REFERENCE("actorNick"), "%2$S": VARIABLE_REFERENCE("reason")}
)
replacements_reason = dict({"%1$S": VARIABLE_REFERENCE("reason")})
replacements_recipient = dict({"%1$S": VARIABLE_REFERENCE("recipient")})
replacements_resourceIdentifier = dict({"%1$S": VARIABLE_REFERENCE("resourceIdentifier")})
replacements_user = dict({"%1$S": VARIABLE_REFERENCE("user")})
replacements_user_clientName_clientVersion = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("clientName"),
        "%3$S": VARIABLE_REFERENCE("clientVersion"),
    }
)
replacements_user_clientName_clientVersion_systemResponse = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("clientName"),
        "%3$S": VARIABLE_REFERENCE("clientVersion"),
        "%4$S": VARIABLE_REFERENCE("systemResponse"),
    }
)
replacements_affectedNick_actorNick = dict(
    {"%1$S": VARIABLE_REFERENCE("affectedNick"), "%2$S": VARIABLE_REFERENCE("actorNick")}
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 12. part {index}"""
    target = reference = "chat/xmpp.ftl"
    source = "chat/xmpp.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

connection-initializing-stream = {COPY(from_path, "connection.initializingStream")}
connection-initializing-encryption = {COPY(from_path, "connection.initializingEncryption")}
connection-authenticating = {COPY(from_path, "connection.authenticating")}
connection-getting-resource = {COPY(from_path, "connection.gettingResource")}
connection-downloading-roster = {COPY(from_path, "connection.downloadingRoster")}
connection-srv-lookup = {COPY(from_path, "connection.srvLookup")}
connection-error-invalid-username = {COPY(from_path, "connection.error.invalidUsername")}
connection-error-failed-to-create-a-socket = {COPY(from_path, "connection.error.failedToCreateASocket")}
connection-error-server-closed-connection = {COPY(from_path, "connection.error.serverClosedConnection")}
connection-error-reset-by-peer = {COPY(from_path, "connection.error.resetByPeer")}
connection-error-timed-out = {COPY(from_path, "connection.error.timedOut")}
connection-error-received-unexpected-data = {COPY(from_path, "connection.error.receivedUnexpectedData")}
connection-error-incorrect-response = {COPY(from_path, "connection.error.incorrectResponse")}
connection-error-start-tls-required = {COPY(from_path, "connection.error.startTLSRequired")}
connection-error-start-tls-not-supported = {COPY(from_path, "connection.error.startTLSNotSupported")}
connection-error-failed-to-start-tls = {COPY(from_path, "connection.error.failedToStartTLS")}
connection-error-no-auth-mec = {COPY(from_path, "connection.error.noAuthMec")}
connection-error-no-compatible-auth-mec = {COPY(from_path, "connection.error.noCompatibleAuthMec")}
connection-error-not-sending-password-in-clear = {COPY(from_path, "connection.error.notSendingPasswordInClear")}
connection-error-authentication-failure = {COPY(from_path, "connection.error.authenticationFailure")}
connection-error-not-authorized = {COPY(from_path, "connection.error.notAuthorized")}
connection-error-failed-to-get-a-resource = {COPY(from_path, "connection.error.failedToGetAResource")}
connection-error-failed-max-resource-limit = {COPY(from_path, "connection.error.failedMaxResourceLimit")}
connection-error-failed-resource-not-valid = {COPY(from_path, "connection.error.failedResourceNotValid")}
connection-error-xmpp-not-supported = {COPY(from_path, "connection.error.XMPPNotSupported")}
conversation-error-not-delivered = {REPLACE(from_path, "conversation.error.notDelivered", replacements_message)}
conversation-error-join-failed = {REPLACE(from_path, "conversation.error.joinFailed", replacements_mucName)}
conversation-error-join-forbidden = {REPLACE(from_path, "conversation.error.joinForbidden", replacements_mucName)}
conversation-error-join-failed-not-authorized = {COPY(from_path, "conversation.error.joinFailedNotAuthorized")}
conversation-error-creation-failed-not-allowed = {COPY(from_path, "conversation.error.creationFailedNotAllowed")}
conversation-error-join-failed-remote-server-not-found = {REPLACE(from_path, "conversation.error.joinFailedRemoteServerNotFound", replacements_mucName)}
conversation-error-change-topic-failed-not-authorized = {COPY(from_path, "conversation.error.changeTopicFailedNotAuthorized")}
conversation-error-send-failed-as-not-inroom = {REPLACE(from_path, "conversation.error.sendFailedAsNotInRoom", replacements_mucName_message)}
conversation-error-send-failed-as-recipient-not-inroom = {REPLACE(from_path, "conversation.error.sendFailedAsRecipientNotInRoom", replacements_jabberIdentifier_message)}
conversation-error-remote-server-not-found = {COPY(from_path, "conversation.error.remoteServerNotFound")}
conversation-error-unknown-send-error = {COPY(from_path, "conversation.error.unknownSendError")}
conversation-error-send-service-unavailable = {REPLACE(from_path, "conversation.error.sendServiceUnavailable", replacements_nick)}
conversation-error-nick-not-in-room = {REPLACE(from_path, "conversation.error.nickNotInRoom", replacements_nick)}
conversation-error-ban-command-anonymous-room = {COPY(from_path, "conversation.error.banCommandAnonymousRoom")}
conversation-error-ban-kick-command-not-allowed = {COPY(from_path, "conversation.error.banKickCommandNotAllowed")}
conversation-error-ban-kick-command-conflict = {COPY(from_path, "conversation.error.banKickCommandConflict")}
conversation-error-change-nick-failed-conflict = {REPLACE(from_path, "conversation.error.changeNickFailedConflict", replacements_nick)}
conversation-error-change-nick-failed-not-acceptable = {REPLACE(from_path, "conversation.error.changeNickFailedNotAcceptable", replacements_nick)}
conversation-error-invite-failed-forbidden = {COPY(from_path, "conversation.error.inviteFailedForbidden")}
conversation-error-failed-jid-not-found = {REPLACE(from_path, "conversation.error.failedJIDNotFound", replacements_jabberIdentifier)}
conversation-error-invalid-jid = {REPLACE(from_path, "conversation.error.invalidJID", replacements_jabberIdentifier)}
conversation-error-command-failed-not-in-room = {COPY(from_path, "conversation.error.commandFailedNotInRoom")}
conversation-error-resource-not-available = {REPLACE(from_path, "conversation.error.resourceNotAvailable", replacements_recipient)}
conversation-error-version-unknown = {REPLACE(from_path, "conversation.error.version.unknown", replacements_recipient)}
tooltip-status = {REPLACE(from_path, "tooltip.status", replacements_resourceIdentifier)}
tooltip-status-no-resource = {COPY(from_path, "tooltip.statusNoResource")}
tooltip-subscription = {COPY(from_path, "tooltip.subscription")}
tooltip-full-name = {COPY(from_path, "tooltip.fullName")}
tooltip-nickname = {COPY(from_path, "tooltip.nickname")}
tooltip-email = {COPY(from_path, "tooltip.email")}
tooltip-birthday = {COPY(from_path, "tooltip.birthday")}
tooltip-user-name = {COPY(from_path, "tooltip.userName")}
tooltip-title = {COPY(from_path, "tooltip.title")}
tooltip-organization = {COPY(from_path, "tooltip.organization")}
tooltip-locality = {COPY(from_path, "tooltip.locality")}
tooltip-country = {COPY(from_path, "tooltip.country")}
tooltip-telephone = {COPY(from_path, "tooltip.telephone")}
chat-room-field-room = {COPY(from_path, "chatRoomField.room")}
chat-room-field-server = {COPY(from_path, "chatRoomField.server")}
chat-room-field-nick = {COPY(from_path, "chatRoomField.nick")}
chat-room-field-password = {COPY(from_path, "chatRoomField.password")}
conversation-muc-invitation-with-reason2 = {REPLACE(from_path, "conversation.muc.invitationWithReason2", replacements_inviter_room_reason)}
conversation-muc-invitation-with-reason2-password = {REPLACE(from_path, "conversation.muc.invitationWithReason2.password", replacements_inviter_room_password_reason)}
conversation-muc-invitation-without-reason = {REPLACE(from_path, "conversation.muc.invitationWithoutReason", replacements_inviter_room)}
conversation-muc-invitation-without-reason-password = {REPLACE(from_path, "conversation.muc.invitationWithoutReason.password", replacements_inviter_room_password)}
conversation-message-join = {REPLACE(from_path, "conversation.message.join", replacements_participant)}
conversation-message-rejoined = {COPY(from_path, "conversation.message.rejoined")}
conversation-message-parted-you = {COPY(from_path, "conversation.message.parted.you")}
conversation-message-parted-you-reason = {REPLACE(from_path, "conversation.message.parted.you.reason", replacements_message)}
conversation-message-parted = {REPLACE(from_path, "conversation.message.parted", replacements_participant)}
conversation-message-parted-reason = {REPLACE(from_path, "conversation.message.parted.reason", replacements_participant_message)}
conversation-message-invitation-declined = {REPLACE(from_path, "conversation.message.invitationDeclined", replacements_invitee)}
conversation-message-invitation-declined-reason = {REPLACE(from_path, "conversation.message.invitationDeclined.reason", replacements_invitee_declineMessage)}
conversation-message-banned = {REPLACE(from_path, "conversation.message.banned", replacements_affectedNick)}
conversation-message-banned-reason = {REPLACE(from_path, "conversation.message.banned.reason", replacements_affectedNick_reason)}
conversation-message-banned-actor = {REPLACE(from_path, "conversation.message.banned.actor", replacements_actorNick_affectedNick)}
conversation-message-banned-actor-reason = {REPLACE(from_path, "conversation.message.banned.actor.reason", replacements_actorNick_affectedNick_reason)}
conversation-message-banned-you = {COPY(from_path, "conversation.message.banned.you")}
conversation-message-banned-you-reason = {REPLACE(from_path, "conversation.message.banned.you.reason", replacements_reason)}
conversation-message-banned-you-actor = {REPLACE(from_path, "conversation.message.banned.you.actor", replacements_actorNick)}
conversation-message-banned-you-actor-reason = {REPLACE(from_path, "conversation.message.banned.you.actor.reason", replacements_actorNick_reason)}
conversation-message-kicked = {REPLACE(from_path, "conversation.message.kicked", replacements_affectedNick)}
conversation-message-kicked-reason = {REPLACE(from_path, "conversation.message.kicked.reason", replacements_affectedNick_reason)}
conversation-message-kicked-actor = {REPLACE(from_path, "conversation.message.kicked.actor", replacements_actorNick_affectedNick)}
conversation-message-kicked-actor-reason = {REPLACE(from_path, "conversation.message.kicked.actor.reason", replacements_actorNick_affectedNick_reason)}
conversation-message-kicked-you = {COPY(from_path, "conversation.message.kicked.you")}
conversation-message-kicked-you-reason = {REPLACE(from_path, "conversation.message.kicked.you.reason", replacements_reason)}
conversation-message-kicked-you-actor = {REPLACE(from_path, "conversation.message.kicked.you.actor", replacements_actorNick)}
conversation-message-kicked-you-actor-reason = {REPLACE(from_path, "conversation.message.kicked.you.actor.reason", replacements_actorNick_reason)}
conversation-message-removed-non-member = {REPLACE(from_path, "conversation.message.removedNonMember", replacements_affectedNick)}
conversation-message-removed-non-member-actor = {REPLACE(from_path, "conversation.message.removedNonMember.actor", replacements_affectedNick_actorNick)}
conversation-message-removed-non-member-you = {COPY(from_path, "conversation.message.removedNonMember.you")}
conversation-message-removed-non-member-you-actor = {REPLACE(from_path, "conversation.message.removedNonMember.you.actor", replacements_actorNick)}
conversation-message-muc-shutdown = {COPY(from_path, "conversation.message.mucShutdown")}
conversation-message-version = {REPLACE(from_path, "conversation.message.version", replacements_user_clientName_clientVersion)}
conversation-message-version-with-os = {REPLACE(from_path, "conversation.message.versionWithOS", replacements_user_clientName_clientVersion_systemResponse)}
options-resource = {COPY(from_path, "options.resource")}
options-priority = {COPY(from_path, "options.priority")}
options-connection-security = {COPY(from_path, "options.connectionSecurity")}
options-connection-security-require-encryption = {COPY(from_path, "options.connectionSecurity.requireEncryption")}
options-connection-security-opportunistic-tls = {COPY(from_path, "options.connectionSecurity.opportunisticTLS")}
options-connection-security-allow-unencrypted-auth = {COPY(from_path, "options.connectionSecurity.allowUnencryptedAuth")}
options-connect-server = {COPY(from_path, "options.connectServer")}
options-connect-port = {COPY(from_path, "options.connectPort")}
options-domain = {COPY(from_path, "options.domain")}
gtalk-protocol-name = {COPY(from_path, "gtalk.protocolName")}
odnoklassniki-protocol-name = {COPY(from_path, "odnoklassniki.protocolName")}
gtalk-disabled = {COPY(from_path, "gtalk.disabled")}
odnoklassniki-username-hint = {COPY(from_path, "odnoklassniki.usernameHint")}
command-join3 = {REPLACE(from_path, "command.join3", replacements_commandName)}
command-part2 = {REPLACE(from_path, "command.part2", replacements_commandName)}
command-topic = {REPLACE(from_path, "command.topic", replacements_commandName)}
command-ban = {REPLACE(from_path, "command.ban", replacements_commandName)}
command-kick = {REPLACE(from_path, "command.kick", replacements_commandName)}
command-invite = {REPLACE(from_path, "command.invite", replacements_commandName)}
command-inviteto = {REPLACE(from_path, "command.inviteto", replacements_commandName)}
command-me = {REPLACE(from_path, "command.me", replacements_commandName)}
command-nick = {REPLACE(from_path, "command.nick", replacements_commandName)}
command-msg = {REPLACE(from_path, "command.msg", replacements_commandName)}
command-version = {REPLACE(from_path, "command.version", replacements_commandName)}

""",
            from_path=source,
            replacements_commandName=replacements_commandName,
            replacements_invitee=replacements_invitee,
            replacements_invitee_declineMessage=replacements_invitee_declineMessage,
            replacements_inviter_room=replacements_inviter_room,
            replacements_inviter_room_password=replacements_inviter_room_password,
            replacements_inviter_room_password_reason=replacements_inviter_room_password_reason,
            replacements_inviter_room_reason=replacements_inviter_room_reason,
            replacements_jabberIdentifier=replacements_jabberIdentifier,
            replacements_jabberIdentifier_message=replacements_jabberIdentifier_message,
            replacements_affectedNick=replacements_affectedNick,
            replacements_affectedNick_reason=replacements_affectedNick_reason,
            replacements_actorNick=replacements_actorNick,
            replacements_actorNick_affectedNick=replacements_actorNick_affectedNick,
            replacements_actorNick_affectedNick_reason=replacements_actorNick_affectedNick_reason,
            replacements_actorNick_reason=replacements_actorNick_reason,
            replacements_message=replacements_message,
            replacements_mucName=replacements_mucName,
            replacements_mucName_message=replacements_mucName_message,
            replacements_nick=replacements_nick,
            replacements_participant=replacements_participant,
            replacements_participant_message=replacements_participant_message,
            replacements_participant_reason=replacements_participant_reason,
            replacements_reason=replacements_reason,
            replacements_recipient=replacements_recipient,
            replacements_resourceIdentifier=replacements_resourceIdentifier,
            replacements_user=replacements_user,
            replacements_user_clientName_clientVersion=replacements_user_clientName_clientVersion,
            replacements_user_clientName_clientVersion_systemResponse=replacements_user_clientName_clientVersion_systemResponse,
            replacements_affectedNick_actorNick=replacements_affectedNick_actorNick,
        ),
    )
