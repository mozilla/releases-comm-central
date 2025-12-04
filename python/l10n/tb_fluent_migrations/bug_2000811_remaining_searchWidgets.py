# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2000811 - Migrate remaining searchWidgets strings to fluent. part {index}"""

    source_ftl = "mail/messenger/messenger.ftl"
    source_attrib = "mail/chrome/messenger/search-attributes.properties"
    source_op = "mail/chrome/messenger/search-operators.properties"
    source_val = "mail/chrome/messenger/messenger.properties"
    source_misc = "mail/chrome/messenger/search.properties"
    source_dtd = "mail/chrome/messenger/searchTermOverlay.dtd"

    dest = reference = "mail/messenger/searchWidgets.ftl"

    ctx.add_transforms(
        dest,
        reference,
        transforms_from(
            """
search-attrib-spam-score-origin = { COPY_PATTERN(from_path, "menuitem-label-spam-score-origin.label") }
search-attrib-spam-percent = { COPY_PATTERN(from_path, "menuitem-label-spam-percentage.label") }
search-attrib-spam-status = { COPY_PATTERN(from_path, "menuitem-label-spam-status.label") }
            """,
            from_path=source_ftl,
        ),
    )

    ctx.add_transforms(
        dest,
        reference,
        transforms_from(
            """
search-attrib-subject = { COPY(from_path, "Subject") }
search-attrib-from = { COPY(from_path, "From") }
search-attrib-body = { COPY(from_path, "Body") }
search-attrib-date = { COPY(from_path, "Date") }
search-attrib-priority = { COPY(from_path, "Priority") }
search-attrib-status = { COPY(from_path, "Status") }
search-attrib-to = { COPY(from_path, "To") }
search-attrib-cc = { COPY(from_path, "Cc") }
search-attrib-to-or-cc = { COPY(from_path, "ToOrCc") }
search-attrib-age-in-days = { COPY(from_path, "AgeInDays") }
search-attrib-size-kb = { COPY(from_path, "SizeKB") }
search-attrib-tags = { COPY(from_path, "Tags") }
search-attrib-any-name = { COPY(from_path, "AnyName") }
search-attrib-display-name = { COPY(from_path, "DisplayName") }
search-attrib-nickname = { COPY(from_path, "Nickname") }
search-attrib-screen-name = { COPY(from_path, "ScreenName") }
search-attrib-email = { COPY(from_path, "Email") }
search-attrib-additional-email = { COPY(from_path, "AdditionalEmail") }
search-attrib-any-number = { COPY(from_path, "AnyNumber") }
search-attrib-work-phone = { COPY(from_path, "WorkPhone") }
search-attrib-home-phone = { COPY(from_path, "HomePhone") }
search-attrib-fax = { COPY(from_path, "Fax") }
search-attrib-pager = { COPY(from_path, "Pager") }
search-attrib-mobile = { COPY(from_path, "Mobile") }
search-attrib-city = { COPY(from_path, "City") }
search-attrib-street = { COPY(from_path, "Street") }
search-attrib-title = { COPY(from_path, "Title") }
search-attrib-organization = { COPY(from_path, "Organization") }
search-attrib-department = { COPY(from_path, "Department") }
search-attrib-from-to-cc-or-bcc = { COPY(from_path, "FromToCcOrBcc") }
search-attrib-attachment-status = { COPY(from_path, "AttachmentStatus") }
search-attrib-label = { COPY(from_path, "Label") }
search-attrib-customize = { COPY(from_path, "Customize") }
search-attrib-missing-custom-term = { COPY(from_path, "MissingCustomTerm") }
            """,
            from_path=source_attrib,
        ),
    )

    ctx.add_transforms(
        dest,
        reference,
        transforms_from(
            """
search-op-contains = { COPY(from_path, "0") }
search-op-doesnt-contain = { COPY(from_path, "1") }
search-op-is = { COPY(from_path, "2") }
search-op-isnt = { COPY(from_path, "3") }
search-op-is-empty = { COPY(from_path, "4") }

search-op-is-before = { COPY(from_path, "5") }
search-op-is-after = { COPY(from_path, "6") }

search-op-is-higher-than = { COPY(from_path, "7") }
search-op-is-lower-than = { COPY(from_path, "8") }

search-op-begins-with = { COPY(from_path, "9") }
search-op-ends-with = { COPY(from_path, "10") }

search-op-sounds-like = { COPY(from_path, "11") }
search-op-ldap-dwim = { COPY(from_path, "12") }

search-op-is-greater-than = { COPY(from_path, "13") }
search-op-is-less-than = { COPY(from_path, "14") }

search-op-name-completion = { COPY(from_path, "15") }
search-op-is-in-ab = { COPY(from_path, "16") }
search-op-isnt-in-ab = { COPY(from_path, "17") }
search-op-isnt-empty = { COPY(from_path, "18") }
search-op-matches = { COPY(from_path, "19") }
search-op-doesnt-match = { COPY(from_path, "20") }
            """,
            from_path=source_op,
        ),
    )

    ctx.add_transforms(
        dest,
        reference,
        transforms_from(
            """
search-val-spam-score-origin-plugin =
  .label = { COPY(from_path, "junkScoreOriginPlugin") }

search-val-spam-score-origin-filter =
  .label = { COPY(from_path, "junkScoreOriginFilter") }

search-val-spam-score-origin-allowlist =
  .label = { COPY(from_path, "junkScoreOriginAllowlist") }

search-val-spam-score-origin-user =
  .label = { COPY(from_path, "junkScoreOriginUser") }

search-val-spam-score-origin-imap-flag =
  .label = { COPY(from_path, "junkScoreOriginImapFlag") }

search-val-has-attachments =
  .label = { COPY(from_path, "hasAttachments") }
            """,
            from_path=source_val,
        ),
    )

    ctx.add_transforms(
        dest,
        reference,
        transforms_from(
            """
search-add-rule-button =
  .label = +
  .tooltiptext = { COPY(from_path, "moreButtonTooltipText") }
search-remove-rule-button =
  .label = -
  .tooltiptext = { COPY(from_path, "lessButtonTooltipText") }
            """,
            from_path=source_misc,
        ),
    )

    ctx.add_transforms(
        dest,
        reference,
        transforms_from(
            """
search-match-all =
  .label = { COPY(from_path, "matchAll.label") }
  .accesskey = { COPY(from_path, "matchAll.accesskey") }

search-match-any =
  .label = { COPY(from_path, "matchAny.label") }
  .accesskey = { COPY(from_path, "matchAny.accesskey") }

search-match-all-msgs =
  .label = { COPY(from_path, "matchAllMsgs.label") }
  .accesskey = { COPY(from_path, "matchAllMsgs.accesskey") }
            """,
            from_path=source_dtd,
        ),
    )
