# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE
from fluent.migratetb.helpers import REPLACE
from fluent.migratetb.transforms import Transform, TransformPattern, PLURALS, REPLACE_IN_TEXT


replacements_channelName = dict({"%1$S": VARIABLE_REFERENCE("channelName")})
replacements_channelName_channelNameRedirect = dict(
    {"%1$S": VARIABLE_REFERENCE("channelName"), "%2$S": VARIABLE_REFERENCE("channelNameRedirect")}
)
replacements_commandName = dict({"%1$S": VARIABLE_REFERENCE("commandName")})
replacements_description_value = dict(
    {"%1$S": VARIABLE_REFERENCE("description"), "%2$S": VARIABLE_REFERENCE("value")}
)
replacements_kickMessage = dict({"%1$S": VARIABLE_REFERENCE("kickMessage")})
replacements_kickedNick_kickerNick_messageKickedReason = dict(
    {
        "%1$S": VARIABLE_REFERENCE("kickedNick"),
        "%2$S": VARIABLE_REFERENCE("kickerNick"),
        "%3$S": VARIABLE_REFERENCE("messageKickedReason"),
    }
)
replacements_locationMatches_nick = dict(
    {"%1$S": VARIABLE_REFERENCE("locationMatches"), "%2$S": VARIABLE_REFERENCE("nick")}
)
replacements_messagePartedReason = dict({"%1$S": VARIABLE_REFERENCE("messagePartedReason")})
replacements_messagePartedReason_partMessage = dict(
    {"%1$S": VARIABLE_REFERENCE("messagePartedReason"), "%2$S": VARIABLE_REFERENCE("partMessage")}
)
replacements_mode = dict({"%1$S": VARIABLE_REFERENCE("mode")})
replacements_mode_targetUser_sourceUser = dict(
    {
        "%1$S": VARIABLE_REFERENCE("mode"),
        "%2$S": VARIABLE_REFERENCE("targetUser"),
        "%3$S": VARIABLE_REFERENCE("sourceUser"),
    }
)
replacements_name = dict({"%1$S": VARIABLE_REFERENCE("name")})
replacements_name_details = dict(
    {"%1$S": VARIABLE_REFERENCE("name"), "%2$S": VARIABLE_REFERENCE("details")}
)
replacements_mode_user = dict(
    {"%1$S": VARIABLE_REFERENCE("mode"), "%2$S": VARIABLE_REFERENCE("user")}
)
replacements_nick = dict({"%1$S": VARIABLE_REFERENCE("nick")})
replacements_nick_conversationName = dict(
    {"%1$S": VARIABLE_REFERENCE("nick"), "%2$S": VARIABLE_REFERENCE("conversationName")}
)
replacements_nick_messageKickedReason = dict(
    {"%1$S": VARIABLE_REFERENCE("nick"), "%2$S": VARIABLE_REFERENCE("messageKickedReason")}
)
replacements_nick_newPassword = dict(
    {"%1$S": VARIABLE_REFERENCE("nick"), "%2$S": VARIABLE_REFERENCE("newPassword")}
)
replacements_nick_nickAndHost = dict(
    {"%1$S": VARIABLE_REFERENCE("nick"), "%2$S": VARIABLE_REFERENCE("nickAndHost")}
)
replacements_nick_quitMessage = dict(
    {"%1$S": VARIABLE_REFERENCE("nick"), "%2$S": VARIABLE_REFERENCE("quitMessage")}
)
replacements_partMessage = dict({"%1$S": VARIABLE_REFERENCE("partMessage")})
replacements_place = dict({"%1$S": VARIABLE_REFERENCE("place")})
replacements_serverName_serverInformation = dict(
    {"%1$S": VARIABLE_REFERENCE("serverName"), "%2$S": VARIABLE_REFERENCE("serverInformation")}
)
replacements_timespan = dict({"%1$S": VARIABLE_REFERENCE("timespan")})
replacements_username = dict({"%1$S": VARIABLE_REFERENCE("username")})
replacements_username_timeResponse = dict(
    {"%1$S": VARIABLE_REFERENCE("username"), "%2$S": VARIABLE_REFERENCE("timeResponse")}
)
replacements_username_version = dict(
    {"%1$S": VARIABLE_REFERENCE("username"), "%2$S": VARIABLE_REFERENCE("version")}
)

about_replacements = dict(
    {
        "%1$S": VARIABLE_REFERENCE("var1"),
        "%2$S": VARIABLE_REFERENCE("var2"),
        "%3$S": VARIABLE_REFERENCE("var3"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 7. part {index}"""
    target = reference = "chat/irc.ftl"
    source = "chat/irc.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

irc-username-hint = {COPY(from_path, "irc.usernameHint")}
connection-error-lost = {COPY(from_path, "connection.error.lost")}
connection-error-time-out = {COPY(from_path, "connection.error.timeOut")}
connection-error-invalid-username = {REPLACE(from_path, "connection.error.invalidUsername", replacements_username)}
connection-error-invalid-password = {COPY(from_path, "connection.error.invalidPassword")}
connection-error-password-required = {COPY(from_path, "connection.error.passwordRequired")}
join-chat-channel = {COPY(from_path, "joinChat.channel")}
join-chat-password = {COPY(from_path, "joinChat.password")}
options-server = {COPY(from_path, "options.server")}
options-port = {COPY(from_path, "options.port")}
options-ssl = {COPY(from_path, "options.ssl")}
options-encoding = {COPY(from_path, "options.encoding")}
options-quit-message = {COPY(from_path, "options.quitMessage")}
options-part-message = {COPY(from_path, "options.partMessage")}
options-show-server-tab = {COPY(from_path, "options.showServerTab")}
options-alternate-nicks = {COPY(from_path, "options.alternateNicks")}
ctcp-version = {REPLACE(from_path, "ctcp.version", replacements_username_version)}
ctcp-time = {REPLACE(from_path, "ctcp.time", replacements_username_timeResponse)}
command-action = {REPLACE(from_path, "command.action", replacements_commandName)}
command-ban = {REPLACE(from_path, "command.ban", replacements_commandName)}
command-ctcp = {REPLACE(from_path, "command.ctcp", replacements_commandName)}
command-chanserv = {REPLACE(from_path, "command.chanserv", replacements_commandName)}
command-deop = {REPLACE(from_path, "command.deop", replacements_commandName)}
command-devoice = {REPLACE(from_path, "command.devoice", replacements_commandName)}
command-invite2 = {REPLACE(from_path, "command.invite2", replacements_commandName)}
command-join = {REPLACE(from_path, "command.join", replacements_commandName)}
command-kick = {REPLACE(from_path, "command.kick", replacements_commandName)}
command-list = {REPLACE(from_path, "command.list", replacements_commandName)}
command-memoserv = {REPLACE(from_path, "command.memoserv", replacements_commandName)}
command-mode-user2 = {REPLACE(from_path, "command.modeUser2", replacements_commandName)}
command-mode-channel2 = {REPLACE(from_path, "command.modeChannel2", replacements_commandName)}
command-msg = {REPLACE(from_path, "command.msg", replacements_commandName)}
command-nick = {REPLACE(from_path, "command.nick", replacements_commandName)}
command-nickserv = {REPLACE(from_path, "command.nickserv", replacements_commandName)}
command-notice = {REPLACE(from_path, "command.notice", replacements_commandName)}
command-op = {REPLACE(from_path, "command.op", replacements_commandName)}
command-operserv = {REPLACE(from_path, "command.operserv", replacements_commandName)}
command-part = {REPLACE(from_path, "command.part", replacements_commandName)}
command-ping = {REPLACE(from_path, "command.ping", replacements_commandName)}
command-quit = {REPLACE(from_path, "command.quit", replacements_commandName)}
command-quote = {REPLACE(from_path, "command.quote", replacements_commandName)}
command-time = {REPLACE(from_path, "command.time", replacements_commandName)}
command-topic = {REPLACE(from_path, "command.topic", replacements_commandName)}
command-umode = {REPLACE(from_path, "command.umode", replacements_commandName)}
command-version = {REPLACE(from_path, "command.version", replacements_commandName)}
command-voice = {REPLACE(from_path, "command.voice", replacements_commandName)}
command-whois2 = {REPLACE(from_path, "command.whois2", replacements_commandName)}
message-join = {REPLACE(from_path, "message.join", replacements_nick_nickAndHost)}
message-rejoined = {COPY(from_path, "message.rejoined")}
message-kicked-you = {REPLACE(from_path, "message.kicked.you", replacements_nick_messageKickedReason)}
message-kicked = {REPLACE(from_path, "message.kicked", replacements_kickedNick_kickerNick_messageKickedReason)}
message-kicked-reason = {REPLACE(from_path, "message.kicked.reason", replacements_kickMessage)}
message-usermode = {REPLACE(from_path, "message.usermode", replacements_mode_targetUser_sourceUser)}
message-channelmode = {REPLACE(from_path, "message.channelmode", replacements_mode_user)}
message-yourmode = {REPLACE(from_path, "message.yourmode", replacements_mode)}
message-nick-fail = {REPLACE(from_path, "message.nick.fail", replacements_nick)}
message-parted-you = {REPLACE(from_path, "message.parted.you", replacements_messagePartedReason)}
message-parted = {REPLACE(from_path, "message.parted", replacements_messagePartedReason_partMessage)}
message-parted-reason = {REPLACE(from_path, "message.parted.reason", replacements_partMessage)}
message-quit = {REPLACE(from_path, "message.quit", replacements_nick_quitMessage)}
message-quit2 = {REPLACE(from_path, "message.quit2", replacements_nick)}
message-invite-received = {REPLACE(from_path, "message.inviteReceived", replacements_nick_conversationName)}
message-invited = {REPLACE(from_path, "message.invited", replacements_nick_conversationName)}
message-already-in-channel = {REPLACE(from_path, "message.alreadyInChannel", replacements_nick_conversationName)}
message-summoned = {REPLACE(from_path, "message.summoned", replacements_nick)}
message-whois = {REPLACE(from_path, "message.whois", replacements_nick)}
message-whowas = {REPLACE(from_path, "message.whowas", replacements_nick)}
message-whois-entry = {REPLACE(from_path, "message.whoisEntry", replacements_description_value)}
message-unknown-nick = {REPLACE(from_path, "message.unknownNick", replacements_nick)}
message-channel-key-added = {REPLACE(from_path, "message.channelKeyAdded", replacements_nick_newPassword)}
message-channel-key-removed = {REPLACE(from_path, "message.channelKeyRemoved", replacements_nick)}
message-ban-masks = {REPLACE(from_path, "message.banMasks", replacements_place)}
message-no-ban-masks = {REPLACE(from_path, "message.noBanMasks", replacements_place)}
message-ban-mask-added = {REPLACE(from_path, "message.banMaskAdded", replacements_locationMatches_nick)}
message-ban-mask-removed = {REPLACE(from_path, "message.banMaskRemoved", replacements_locationMatches_nick)}

""",
            from_path=source,
            replacements_channelName=replacements_channelName,
            replacements_channelName_channelNameRedirect=replacements_channelName_channelNameRedirect,
            replacements_commandName=replacements_commandName,
            replacements_description_value=replacements_description_value,
            replacements_kickMessage=replacements_kickMessage,
            replacements_kickedNick_kickerNick_messageKickedReason=replacements_kickedNick_kickerNick_messageKickedReason,
            replacements_locationMatches_nick=replacements_locationMatches_nick,
            replacements_messagePartedReason=replacements_messagePartedReason,
            replacements_messagePartedReason_partMessage=replacements_messagePartedReason_partMessage,
            replacements_mode=replacements_mode,
            replacements_mode_targetUser_sourceUser=replacements_mode_targetUser_sourceUser,
            replacements_mode_user=replacements_mode_user,
            replacements_nick=replacements_nick,
            replacements_nick_conversationName=replacements_nick_conversationName,
            replacements_nick_messageKickedReason=replacements_nick_messageKickedReason,
            replacements_nick_newPassword=replacements_nick_newPassword,
            replacements_nick_nickAndHost=replacements_nick_nickAndHost,
            replacements_nick_quitMessage=replacements_nick_quitMessage,
            replacements_partMessage=replacements_partMessage,
            replacements_place=replacements_place,
            replacements_serverName_serverInformation=replacements_serverName_serverInformation,
            replacements_timespan=replacements_timespan,
            replacements_username=replacements_username,
            replacements_username_timeResponse=replacements_username_timeResponse,
            replacements_username_version=replacements_username_version,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("message-ping"),
                comment=FTL.Comment(
                    "$source is the nickname of the user or the server that was pinged.\n$delay is the delay (in milliseconds)."
                ),
                value=PLURALS(
                    source,
                    "message.ping",
                    VARIABLE_REFERENCE("delay"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#2": VARIABLE_REFERENCE("delay"),
                                "%1$S": VARIABLE_REFERENCE("source"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

error-no-channel = {REPLACE(from_path, "error.noChannel", replacements_name)}
error-too-many-channels = {REPLACE(from_path, "error.tooManyChannels", replacements_name)}
error-nick-collision = {REPLACE(from_path, "error.nickCollision", replacements_name_details)}
error-erroneous-nickname = {REPLACE(from_path, "error.erroneousNickname", replacements_name)}
error-banned = {COPY(from_path, "error.banned")}
error-banned-soon = {COPY(from_path, "error.bannedSoon")}
error-mode-wrong-user = {COPY(from_path, "error.mode.wrongUser")}
error-no-such-nick = {REPLACE(from_path, "error.noSuchNick", replacements_name)}
error-was-no-such-nick = {REPLACE(from_path, "error.wasNoSuchNick", replacements_name)}
error-no-such-channel = {REPLACE(from_path, "error.noSuchChannel", replacements_name)}
error-unavailable = {REPLACE(from_path, "error.unavailable", replacements_name)}
error-channel-banned = {REPLACE(from_path, "error.channelBanned", replacements_name)}
error-cannot-send-to-channel = {REPLACE(from_path, "error.cannotSendToChannel", replacements_name)}
error-channel-full = {REPLACE(from_path, "error.channelFull", replacements_name)}
error-invite-only = {REPLACE(from_path, "error.inviteOnly", replacements_name)}
error-non-unique-target = {REPLACE(from_path, "error.nonUniqueTarget", replacements_name)}
error-not-channel-op = {REPLACE(from_path, "error.notChannelOp", replacements_name)}
error-not-channel-owner = {REPLACE(from_path, "error.notChannelOwner", replacements_name)}
error-wrong-key = {REPLACE(from_path, "error.wrongKey", replacements_name)}
error-send-message-failed = {COPY(from_path, "error.sendMessageFailed")}
error-channel-forward = {REPLACE(from_path, "error.channelForward", replacements_name_details)}
error-unknown-mode = {REPLACE(from_path, "error.unknownMode", replacements_mode)}
tooltip-realname = {COPY(from_path, "tooltip.realname")}
tooltip-server = {COPY(from_path, "tooltip.server")}
tooltip-connected-from = {COPY(from_path, "tooltip.connectedFrom")}
tooltip-registered = {COPY(from_path, "tooltip.registered")}
tooltip-registered-as = {COPY(from_path, "tooltip.registeredAs")}
tooltip-secure = {COPY(from_path, "tooltip.secure")}
tooltip-away = {COPY(from_path, "tooltip.away")}
tooltip-irc-op = {COPY(from_path, "tooltip.ircOp")}
tooltip-bot = {COPY(from_path, "tooltip.bot")}
tooltip-last-activity = {COPY(from_path, "tooltip.lastActivity")}
tooltip-timespan = {REPLACE(from_path, "tooltip.timespan", replacements_timespan)}
tooltip-channels = {COPY(from_path, "tooltip.channels")}
tooltip-server-value = {REPLACE(from_path, "tooltip.serverValue", replacements_serverName_serverInformation)}
yes-key-key = {COPY(from_path, "yes")}
no-key-key = {COPY(from_path, "no")}

""",
            from_path=source,
            replacements_name=replacements_name,
            replacements_name_details=replacements_name_details,
            replacements_channelName_channelNameRedirect=replacements_channelName_channelNameRedirect,
            replacements_commandName=replacements_commandName,
            replacements_description_value=replacements_description_value,
            replacements_kickMessage=replacements_kickMessage,
            replacements_kickedNick_kickerNick_messageKickedReason=replacements_kickedNick_kickerNick_messageKickedReason,
            replacements_locationMatches_nick=replacements_locationMatches_nick,
            replacements_messagePartedReason=replacements_messagePartedReason,
            replacements_messagePartedReason_partMessage=replacements_messagePartedReason_partMessage,
            replacements_mode=replacements_mode,
            replacements_mode_targetUser_sourceUser=replacements_mode_targetUser_sourceUser,
            replacements_mode_user=replacements_mode_user,
            replacements_nick=replacements_nick,
            replacements_nick_conversationName=replacements_nick_conversationName,
            replacements_nick_messageKickedReason=replacements_nick_messageKickedReason,
            replacements_nick_newPassword=replacements_nick_newPassword,
            replacements_nick_nickAndHost=replacements_nick_nickAndHost,
            replacements_nick_quitMessage=replacements_nick_quitMessage,
            replacements_partMessage=replacements_partMessage,
            replacements_place=replacements_place,
            replacements_serverName_serverInformation=replacements_serverName_serverInformation,
            replacements_timespan=replacements_timespan,
            replacements_username=replacements_username,
            replacements_username_timeResponse=replacements_username_timeResponse,
            replacements_username_version=replacements_username_version,
        ),
    )
