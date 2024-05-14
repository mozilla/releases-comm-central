# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

replacements_commandName = dict({"%1$S": VARIABLE_REFERENCE("commandName")})
replacements_message = dict({"%1$S": VARIABLE_REFERENCE("message")})
replacements_powerLevelName = dict({"%1$S": VARIABLE_REFERENCE("powerLevelName")})
replacements_powerLevelName_powerLevelNumber = dict(
    {"%1$S": VARIABLE_REFERENCE("powerLevelName"), "%2$S": VARIABLE_REFERENCE("powerLevelNumber")}
)
replacements_sessionId_sessionDisplayName = dict(
    {"%1$S": VARIABLE_REFERENCE("sessionId"), "%2$S": VARIABLE_REFERENCE("sessionDisplayName")}
)
replacements_status = dict({"%1$S": VARIABLE_REFERENCE("status")})
replacements_timespan = dict({"%1$S": VARIABLE_REFERENCE("timespan")})
replacements_user = dict({"%1$S": VARIABLE_REFERENCE("user")})
replacements_s_to_user = dict({"$S": VARIABLE_REFERENCE("user")})
replacements_userThatReacted_userThatSentMessage_reaction = dict(
    {
        "%1$S": VARIABLE_REFERENCE("userThatReacted"),
        "%2$S": VARIABLE_REFERENCE("userThatSentMessage"),
        "%3$S": VARIABLE_REFERENCE("reaction"),
    }
)
replacements_user_addresses = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("addresses")}
)
replacements_user_changedName = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("changedName")}
)
replacements_user_nameRemoved = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("nameRemoved")}
)
replacements_user_newRoomName = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("newRoomName")}
)
replacements_user_oldAddress_newAddress = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("oldAddress"),
        "%3$S": VARIABLE_REFERENCE("newAddress"),
    }
)
replacements_user_oldDisplayName_newDisplayName = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("oldDisplayName"),
        "%3$S": VARIABLE_REFERENCE("newDisplayName"),
    }
)
replacements_user_oldPowerLevel_newPowerLevel = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("oldPowerLevel"),
        "%3$S": VARIABLE_REFERENCE("newPowerLevel"),
    }
)
replacements_user_powerLevelChanges = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("powerLevelChanges")}
)
replacements_user_reason = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("reason")}
)
replacements_user_removedAddresses_addedAddresses = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("removedAddresses"),
        "%3$S": VARIABLE_REFERENCE("addedAddresses"),
    }
)
replacements_user_userBanned_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("userBanned"),
        "%3$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_user_userGotKicked = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userGotKicked")}
)
replacements_user_userGotKicked_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("userGotKicked"),
        "%3$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_user_userInvitationWithdrawn = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userInvitationWithdrawn")}
)
replacements_user_userInvitationWithdrawn_reason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("userInvitationWithdrawn"),
        "%3$S": VARIABLE_REFERENCE("reason"),
    }
)
replacements_user_userReceiving = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userReceiving")}
)
replacements_user_userTarget = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userTarget")}
)
replacements_user_userUnbanned = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userUnbanned")}
)
replacements_user_userWhoGotInvited = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userWhoGotInvited")}
)
replacements_user_userWhoSent = dict(
    {"%1$S": VARIABLE_REFERENCE("user"), "%2$S": VARIABLE_REFERENCE("userWhoSent")}
)
replacements_value = dict({"%1$S": VARIABLE_REFERENCE("value")})


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 9. part {index}"""
    target = reference = "chat/matrix-properties.ftl"
    source = "chat/matrix.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

matrix-username-hint = {COPY(from_path, "matrix.usernameHint")}
options-save-token = {COPY(from_path, "options.saveToken")}
options-device-display-name = {COPY(from_path, "options.deviceDisplayName")}
options-homeserver = {COPY(from_path, "options.homeserver")}
options-backup-passphrase = {COPY(from_path, "options.backupPassphrase")}
options-encryption-enabled = {REPLACE(from_path, "options.encryption.enabled", replacements_status)}
options-encryption-secret-storage = {REPLACE(from_path, "options.encryption.secretStorage", replacements_status)}
options-encryption-key-backup = {REPLACE(from_path, "options.encryption.keyBackup", replacements_status)}
options-encryption-cross-signing = {REPLACE(from_path, "options.encryption.crossSigning", replacements_status)}
options-encryption-status-ok = {COPY(from_path, "options.encryption.statusOk")}
options-encryption-status-not-ok = {COPY(from_path, "options.encryption.statusNotOk")}
options-encryption-need-backup-passphrase = {COPY(from_path, "options.encryption.needBackupPassphrase")}
options-encryption-set-up-secret-storage = {COPY(from_path, "options.encryption.setUpSecretStorage")}
options-encryption-set-up-backup-and-cross-signing = {COPY(from_path, "options.encryption.setUpBackupAndCrossSigning")}
options-encryption-session = {REPLACE(from_path, "options.encryption.session", replacements_sessionId_sessionDisplayName)}
connection-request-auth = {COPY(from_path, "connection.requestAuth")}
connection-request-access = {COPY(from_path, "connection.requestAccess")}
connection-error-no-supported-flow = {COPY(from_path, "connection.error.noSupportedFlow")}
connection-error-auth-cancelled = {COPY(from_path, "connection.error.authCancelled")}
connection-error-session-ended = {COPY(from_path, "connection.error.sessionEnded")}
connection-error-server-not-found = {COPY(from_path, "connection.error.serverNotFound")}
chat-room-field-room = {COPY(from_path, "chatRoomField.room")}
tooltip-display-name = {COPY(from_path, "tooltip.displayName")}
tooltip-timespan = {REPLACE(from_path, "tooltip.timespan", replacements_timespan)}
tooltip-last-active = {COPY(from_path, "tooltip.lastActive")}
power-level-default = {COPY(from_path, "powerLevel.default")}
power-level-moderator = {COPY(from_path, "powerLevel.moderator")}
power-level-admin = {COPY(from_path, "powerLevel.admin")}
power-level-restricted = {COPY(from_path, "powerLevel.restricted")}
power-level-custom = {COPY(from_path, "powerLevel.custom")}
power-level-detailed = {REPLACE(from_path, "powerLevel.detailed", replacements_powerLevelName_powerLevelNumber)}
power-level-default-role = {REPLACE(from_path, "powerLevel.defaultRole", replacements_powerLevelName)}
power-level-invite-user = {REPLACE(from_path, "powerLevel.inviteUser", replacements_powerLevelName)}
power-level-kick-users = {REPLACE(from_path, "powerLevel.kickUsers", replacements_powerLevelName)}
power-level-ban = {REPLACE(from_path, "powerLevel.ban", replacements_powerLevelName)}
power-level-room-avatar = {REPLACE(from_path, "powerLevel.roomAvatar", replacements_powerLevelName)}
power-level-main-address = {REPLACE(from_path, "powerLevel.mainAddress", replacements_powerLevelName)}
power-level-history = {REPLACE(from_path, "powerLevel.history", replacements_powerLevelName)}
power-level-room-name = {REPLACE(from_path, "powerLevel.roomName", replacements_powerLevelName)}
power-level-change-permissions = {REPLACE(from_path, "powerLevel.changePermissions", replacements_powerLevelName)}
power-level-server-acl = {REPLACE(from_path, "powerLevel.server_acl", replacements_powerLevelName)}
power-level-upgrade-room = {REPLACE(from_path, "powerLevel.upgradeRoom", replacements_powerLevelName)}
power-level-remove = {REPLACE(from_path, "powerLevel.remove", replacements_powerLevelName)}
power-level-events-default = {REPLACE(from_path, "powerLevel.events_default", replacements_powerLevelName)}
power-level-state-default = {REPLACE(from_path, "powerLevel.state_default", replacements_powerLevelName)}
power-level-encryption = {REPLACE(from_path, "powerLevel.encryption", replacements_powerLevelName)}
power-level-topic = {REPLACE(from_path, "powerLevel.topic", replacements_powerLevelName)}
detail-name = {REPLACE(from_path, "detail.name", replacements_value)}
detail-topic = {REPLACE(from_path, "detail.topic", replacements_value)}
detail-version = {REPLACE(from_path, "detail.version", replacements_value)}
detail-room-id = {REPLACE(from_path, "detail.roomId", replacements_value)}
detail-admin = {REPLACE(from_path, "detail.admin", replacements_value)}
detail-moderator = {REPLACE(from_path, "detail.moderator", replacements_value)}
detail-alias = {REPLACE(from_path, "detail.alias", replacements_value)}
detail-guest = {REPLACE(from_path, "detail.guest", replacements_value)}
detail-power = {COPY(from_path, "detail.power")}
command-ban = {REPLACE(from_path, "command.ban", replacements_commandName)}
command-invite = {REPLACE(from_path, "command.invite", replacements_commandName)}
command-kick = {REPLACE(from_path, "command.kick", replacements_commandName)}
command-nick = {REPLACE(from_path, "command.nick", replacements_commandName)}
command-op = {REPLACE(from_path, "command.op", replacements_commandName)}
command-deop = {REPLACE(from_path, "command.deop", replacements_commandName)}
command-leave = {REPLACE(from_path, "command.leave", replacements_commandName)}
command-topic = {REPLACE(from_path, "command.topic", replacements_commandName)}
command-unban = {REPLACE(from_path, "command.unban", replacements_commandName)}
command-visibility = {REPLACE(from_path, "command.visibility", replacements_commandName)}
command-guest = {REPLACE(from_path, "command.guest", replacements_commandName)}
command-roomname = {REPLACE(from_path, "command.roomname", replacements_commandName)}
command-detail = {REPLACE(from_path, "command.detail", replacements_commandName)}
command-addalias = {REPLACE(from_path, "command.addalias", replacements_commandName)}
command-removealias = {REPLACE(from_path, "command.removealias", replacements_commandName)}
command-upgraderoom = {REPLACE(from_path, "command.upgraderoom", replacements_commandName)}
command-me = {REPLACE(from_path, "command.me", replacements_commandName)}
command-msg = {REPLACE(from_path, "command.msg", replacements_commandName)}
command-join = {REPLACE(from_path, "command.join", replacements_commandName)}
message-banned = {REPLACE(from_path, "message.banned", replacements_user_userBanned_reason)}
message-banned-with-reason = {REPLACE(from_path, "message.bannedWithReason", replacements_user_userBanned_reason)}
message-accepted-invite-for = {REPLACE(from_path, "message.acceptedInviteFor", replacements_user_userWhoSent)}
message-accepted-invite = {REPLACE(from_path, "message.acceptedInvite", replacements_s_to_user)}
message-invited = {REPLACE(from_path, "message.invited", replacements_user_userWhoGotInvited)}
message-display-name-changed = {REPLACE(from_path, "message.displayName.changed", replacements_user_oldDisplayName_newDisplayName)}
message-display-name-set = {REPLACE(from_path, "message.displayName.set", replacements_user_changedName)}
message-display-name-remove = {REPLACE(from_path, "message.displayName.remove", replacements_user_nameRemoved)}
message-joined = {REPLACE(from_path, "message.joined", replacements_user)}
message-rejected-invite = {REPLACE(from_path, "message.rejectedInvite", replacements_user)}
message-left = {REPLACE(from_path, "message.left", replacements_user)}
message-unbanned = {REPLACE(from_path, "message.unbanned", replacements_user_userUnbanned)}
message-kicked = {REPLACE(from_path, "message.kicked", replacements_user_userGotKicked)}
message-kicked-with-reason = {REPLACE(from_path, "message.kickedWithReason", replacements_user_userGotKicked_reason)}
message-withdrew-invite = {REPLACE(from_path, "message.withdrewInvite", replacements_user_userInvitationWithdrawn)}
message-withdrew-invite-with-reason = {REPLACE(from_path, "message.withdrewInviteWithReason", replacements_user_userInvitationWithdrawn_reason)}
message-room-name-remove = {REPLACE(from_path, "message.roomName.remove", replacements_user)}
message-room-name-changed = {REPLACE(from_path, "message.roomName.changed", replacements_user_newRoomName)}
message-power-level-changed = {REPLACE(from_path, "message.powerLevel.changed", replacements_user_powerLevelChanges)}
message-power-level-from-to = {REPLACE(from_path, "message.powerLevel.fromTo", replacements_user_oldPowerLevel_newPowerLevel)}
message-guest-allowed = {REPLACE(from_path, "message.guest.allowed", replacements_user)}
message-guest-prevented = {REPLACE(from_path, "message.guest.prevented", replacements_user)}
message-history-anyone = {REPLACE(from_path, "message.history.anyone", replacements_user)}
message-history-shared = {REPLACE(from_path, "message.history.shared", replacements_user)}
message-history-invited = {REPLACE(from_path, "message.history.invited", replacements_user)}
message-history-joined = {REPLACE(from_path, "message.history.joined", replacements_user)}
message-alias-main = {REPLACE(from_path, "message.alias.main", replacements_user_oldAddress_newAddress)}
message-alias-added = {REPLACE(from_path, "message.alias.added", replacements_user_addresses)}
message-alias-removed = {REPLACE(from_path, "message.alias.removed", replacements_user_addresses)}
message-alias-removed-and-added = {REPLACE(from_path, "message.alias.removedAndAdded", replacements_user_removedAddresses_addedAddresses)}
message-space-not-supported = {COPY(from_path, "message.spaceNotSupported")}
message-encryption-start = {COPY(from_path, "message.encryptionStart")}
message-verification-request2 = {REPLACE(from_path, "message.verification.request2", replacements_user_userReceiving)}
message-verification-cancel2 = {REPLACE(from_path, "message.verification.cancel2", replacements_user_reason)}
message-verification-done = {COPY(from_path, "message.verification.done")}
message-decryption-error = {COPY(from_path, "message.decryptionError")}
message-decrypting = {COPY(from_path, "message.decrypting")}
message-redacted = {COPY(from_path, "message.redacted")}
message-reaction = {REPLACE(from_path, "message.reaction", replacements_userThatReacted_userThatSentMessage_reaction)}
message-action-request-key = {COPY(from_path, "message.action.requestKey")}
message-action-redact = {COPY(from_path, "message.action.redact")}
message-action-report = {COPY(from_path, "message.action.report")}
message-action-retry = {COPY(from_path, "message.action.retry")}
message-action-cancel = {COPY(from_path, "message.action.cancel")}
error-send-message-failed = {REPLACE(from_path, "error.sendMessageFailed", replacements_message)}

""",
            from_path=source,
            replacements_commandName=replacements_commandName,
            replacements_message=replacements_message,
            replacements_powerLevelName=replacements_powerLevelName,
            replacements_powerLevelName_powerLevelNumber=replacements_powerLevelName_powerLevelNumber,
            replacements_sessionId_sessionDisplayName=replacements_sessionId_sessionDisplayName,
            replacements_status=replacements_status,
            replacements_timespan=replacements_timespan,
            replacements_user=replacements_user,
            replacements_s_to_user=replacements_s_to_user,
            replacements_userThatReacted_userThatSentMessage_reaction=replacements_userThatReacted_userThatSentMessage_reaction,
            replacements_user_addresses=replacements_user_addresses,
            replacements_user_changedName=replacements_user_changedName,
            replacements_user_nameRemoved=replacements_user_nameRemoved,
            replacements_user_newRoomName=replacements_user_newRoomName,
            replacements_user_oldAddress_newAddress=replacements_user_oldAddress_newAddress,
            replacements_user_oldDisplayName_newDisplayName=replacements_user_oldDisplayName_newDisplayName,
            replacements_user_oldPowerLevel_newPowerLevel=replacements_user_oldPowerLevel_newPowerLevel,
            replacements_user_powerLevelChanges=replacements_user_powerLevelChanges,
            replacements_user_reason=replacements_user_reason,
            replacements_user_removedAddresses_addedAddresses=replacements_user_removedAddresses_addedAddresses,
            replacements_user_userBanned_reason=replacements_user_userBanned_reason,
            replacements_user_userGotKicked=replacements_user_userGotKicked,
            replacements_user_userGotKicked_reason=replacements_user_userGotKicked_reason,
            replacements_user_userInvitationWithdrawn=replacements_user_userInvitationWithdrawn,
            replacements_user_userInvitationWithdrawn_reason=replacements_user_userInvitationWithdrawn_reason,
            replacements_user_userReceiving=replacements_user_userReceiving,
            replacements_user_userTarget=replacements_user_userTarget,
            replacements_user_userUnbanned=replacements_user_userUnbanned,
            replacements_user_userWhoGotInvited=replacements_user_userWhoGotInvited,
            replacements_user_userWhoSent=replacements_user_userWhoSent,
            replacements_value=replacements_value,
        ),
    )
