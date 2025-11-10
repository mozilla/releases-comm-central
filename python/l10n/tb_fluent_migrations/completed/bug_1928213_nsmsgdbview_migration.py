# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1928213 - Migrate properties used by nsMsgDBView to fluent. part {index}"""
    source = "mail/chrome/messenger/messenger.properties"

    ctx.add_transforms(
        "mail/messenger/messenger.ftl",
        "mail/messenger/messenger.ftl",
        transforms_from(
            """
message-priority-lowest = { COPY(from_path, "priorityLowest") }
message-priority-low = { COPY(from_path, "priorityLow") }
message-priority-normal = { COPY(from_path, "priorityNormal") }
message-priority-high = { COPY(from_path, "priorityHigh") }
message-priority-highest = { COPY(from_path, "priorityHighest") }

message-flag-replied = { COPY(from_path, "replied") }
message-flag-forwarded = { COPY(from_path, "forwarded") }
message-flag-redirected = { COPY(from_path, "redirected") }
message-flag-new = { COPY(from_path, "new") }
message-flag-read = { COPY(from_path, "read") }
message-flag-starred = { COPY(from_path, "flagged") }

message-group-today = { COPY(from_path, "today") }
message-group-yesterday = { COPY(from_path, "yesterday") }
message-group-last-seven-days = { COPY(from_path, "last7Days") }
message-group-last-fourteen-days = { COPY(from_path, "last14Days") }
message-group-older = { COPY(from_path, "older") }
message-group-future-date = { COPY(from_path, "futureDate") }

message-group-untagged = { COPY(from_path, "untaggedMessages") }
message-group-no-status = { COPY(from_path, "messagesWithNoStatus") }
message-group-no-priority = { COPY(from_path, "noPriority") }
message-group-no-attachments = { COPY(from_path, "noAttachments") }
message-group-attachments = { COPY(from_path, "attachments") }
message-group-not-starred = { COPY(from_path, "notFlagged") }
message-group-starred = { COPY(from_path, "groupFlagged") }

and-others = { COPY(from_path, "andOthers") }
            """,
            from_path=source,
        ),
    )
