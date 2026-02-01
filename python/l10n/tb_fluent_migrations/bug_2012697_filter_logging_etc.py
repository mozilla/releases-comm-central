# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE

def migrate(ctx):
    """Bug 2012697 - Migrate filter logging and editor validation strings to Fluent. part {index}"""

    prop_source = "mail/chrome/messenger/filter.properties"
    ftl_target = "mail/messenger/filterEditor.ftl"

    replacements_failure = {
        "%1$S": VARIABLE_REFERENCE("errorMsg"),
        "%2$S": VARIABLE_REFERENCE("errorCode"),
    }

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
filter-failure-warning-prefix = { REPLACE(from_path, "filterFailureWarningPrefix", replacements) }

filter-failure-sending-reply-error = { COPY(from_path, "filterFailureSendingReplyError") }
filter-failure-sending-reply-aborted = { COPY(from_path, "filterFailureSendingReplyAborted") }
filter-failure-move-failed = { COPY(from_path, "filterFailureMoveFailed") }
filter-failure-copy-failed = { COPY(from_path, "filterFailureCopyFailed") }
filter-failure-action = { COPY(from_path, "filterFailureAction") }

filter-editor-must-select-target-folder = { COPY(from_path, "mustSelectFolder") }
filter-editor-enter-valid-email-forward = { COPY(from_path, "enterValidEmailAddress") }
filter-editor-pick-template-reply = { COPY(from_path, "pickTemplateToReplyWith") }
filter-missing-custom-action = { COPY(from_path, "filterMissingCustomAction") }
            """,
            from_path=prop_source,
            replacements=replacements_failure,
        ),
    )

    replacements_log = {
        "%1$S": VARIABLE_REFERENCE("filterName"),
        "%2$S": VARIABLE_REFERENCE("author"),
        "%3$S": VARIABLE_REFERENCE("subject"),
        "%4$S": VARIABLE_REFERENCE("date"),
    }

    replacements_copy = {
        "%1$S": VARIABLE_REFERENCE("id"),
        "%2$S": VARIABLE_REFERENCE("folder"),
    }

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
filter-log-match-summary = { REPLACE(from_path, "filterLogDetectStr", replacements) }

copied-message-log = { REPLACE(from_path, "logCopyStr", copy_replacements) }
            """,
            from_path=prop_source,
            replacements=replacements_log,
            copy_replacements=replacements_copy,
        ),
    )

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
filter-action-log-priority = { COPY(from_path, "filterAction2") }
filter-action-log-deleted = { COPY(from_path, "filterAction3") }
filter-action-log-read = { COPY(from_path, "filterAction4") }
filter-action-log-kill = { COPY(from_path, "filterAction5") }
filter-action-log-watch = { COPY(from_path, "filterAction6") }
filter-action-log-starred = { COPY(from_path, "filterAction7") }
filter-action-log-replied = { COPY(from_path, "filterAction9") }
filter-action-log-forwarded = { COPY(from_path, "filterAction10") }
filter-action-log-stop = { COPY(from_path, "filterAction11") }
filter-action-log-pop3-delete = { COPY(from_path, "filterAction12") }
filter-action-log-pop3-leave = { COPY(from_path, "filterAction13") }
filter-action-log-pop3-fetch = { COPY(from_path, "filterAction15") }
filter-action-log-tagged = { COPY(from_path, "filterAction17") }
filter-action-log-ignore-subthread = { COPY(from_path, "filterAction18") }
filter-action-log-unread = { COPY(from_path, "filterAction19") }
            """,
            from_path=prop_source,
        ),
    )
