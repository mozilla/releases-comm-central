# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

about_replacements_statuses = dict(
    {
        "%1$S": VARIABLE_REFERENCE("displayName"),
        "%2$S": VARIABLE_REFERENCE("statusType"),
        "%3$S": VARIABLE_REFERENCE("statusText"),
    }
)
about_replacements_message = dict(
    {
        "%1$S": VARIABLE_REFERENCE("message"),
    }
)
about_replacements_conversation_name = dict(
    {
        "%1$S": VARIABLE_REFERENCE("conversationName"),
        "%2$S": VARIABLE_REFERENCE("topic"),
    }
)
# topic-changed = { $user } has changed the topic to: { $topic }.
about_replacements_user_topic = dict(
    {
        "%1$S": VARIABLE_REFERENCE("user"),
        "%2$S": VARIABLE_REFERENCE("topic"),
    }
)
about_replacements_oldnick_newick = dict(
    {
        "%1$S": VARIABLE_REFERENCE("oldNick"),
        "%2$S": VARIABLE_REFERENCE("newNick"),
    }
)
about_replacements_newnick = dict(
    {
        "%1$S": VARIABLE_REFERENCE("newNick"),
    }
)

about_replacements_target_name_target_protocol = dict(
    {
        "%1$S": VARIABLE_REFERENCE("targetName"),
        "%2$S": VARIABLE_REFERENCE("targetProtocol"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 4. part {index}"""
    target = reference = "chat/conversations.ftl"
    source = "chat/conversations.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

target-changed = {REPLACE(from_path, "targetChanged", about_replacements_target_name_target_protocol)}
status-changed = {REPLACE(from_path, "statusChanged", about_replacements_statuses)}
status-changed-with-status-text = {REPLACE(from_path, "statusChangedWithStatusText", about_replacements_statuses)}
status-changed-from-unknown = {REPLACE(from_path, "statusChangedFromUnknown", about_replacements_statuses)}
status-changed-from-unknown-with-status-text = {REPLACE(from_path, "statusChangedFromUnknownWithStatusText", about_replacements_statuses)}
status-known = {REPLACE(from_path, "statusKnown", about_replacements_statuses)}
status-known-with-status-text = {REPLACE(from_path, "statusKnownWithStatusText", about_replacements_statuses)}
status-unknown = {REPLACE(from_path, "statusUnknown", about_replacements_statuses)}
account-disconnected = {COPY(from_path, "accountDisconnected")}
account-reconnected = {COPY(from_path, "accountReconnected")}
auto-reply = {REPLACE(from_path, "autoReply", about_replacements_message)}
no-topic-key = {COPY(from_path, "noTopic")}
topic-set = {REPLACE(from_path, "topicSet", about_replacements_conversation_name)}
topic-not-set = {REPLACE(from_path, "topicNotSet", about_replacements_conversation_name)}
topic-changed = {REPLACE(from_path, "topicChanged", about_replacements_user_topic)}
topic-cleared = {REPLACE(from_path, "topicCleared", about_replacements_user_topic)}
nick-set-key = {REPLACE(from_path, "nickSet", about_replacements_oldnick_newick)}
nick-set-you = {REPLACE(from_path, "nickSet.you", about_replacements_newnick)}
messenger-conversations-selections-ellipsis = {COPY(from_path, "messenger.conversations.selections.ellipsis")}
messenger-conversations-selections-system-messages-template = {COPY(from_path, "messenger.conversations.selections.systemMessagesTemplate")}
messenger-conversations-selections-content-messages-template = {COPY(from_path, "messenger.conversations.selections.contentMessagesTemplate")}
messenger-conversations-selections-action-messages-template = {COPY(from_path, "messenger.conversations.selections.actionMessagesTemplate")}

""",
            from_path=source,
            about_replacements_target_name_target_protocol=about_replacements_target_name_target_protocol,
            about_replacements_statuses=about_replacements_statuses,
            about_replacements_message=about_replacements_message,
            about_replacements_conversation_name=about_replacements_conversation_name,
            about_replacements_user_topic=about_replacements_user_topic,
            about_replacements_oldnick_newick=about_replacements_oldnick_newick,
            about_replacements_newnick=about_replacements_newnick,
        ),
    )
