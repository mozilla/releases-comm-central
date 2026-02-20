#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, TERM_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT, COPY


def migrate(ctx):
    """Bug 1935334 - Migrate compose from PluralForm.sys.mjs, part {index}."""

    source = "mail/chrome/messenger/messengercompose/composeMsgs.properties"
    target = reference = "mail/messenger/messengercompose/messengercompose.ftl"

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("blocked-content-message"),
                value=PLURALS(
                    source,
                    "blockedContentMessage",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%S": TERM_REFERENCE("brand-short-name"),
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
        [
            FTL.Message(
                id=FTL.Identifier("remove-attachment-cmd"),
                attributes=[
                    FTL.Attribute(
                       id=FTL.Identifier("label"),
                       value=PLURALS(
                          source,
                          "removeAttachmentMsgs",
                          VARIABLE_REFERENCE("count"),
                          foreach=lambda n: REPLACE_IN_TEXT(
                              n,
                              dict(
                              ),
                          ),
                       )
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY("mail/chrome/messenger/messengercompose/messengercompose.dtd", "removeAttachment.accesskey"),
                    ),
                ],
            )
        ]
    )
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
default-delete-cmd =
    .label = {COPY(from_path, "deleteCmd.label")}
    .accesskey = {COPY(from_path, "deleteCmd.accesskey")}
""",
            from_path="mail/chrome/communicator/utilityOverlay.dtd",
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("attachment-reminder-keywords-msg"),
                value=PLURALS(
                    source,
                    "attachmentReminderKeywordsMsgs",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
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
        [
            FTL.Message(
                id=FTL.Identifier("big-file-notification"),
                attributes=[
                    FTL.Attribute(
                       id=FTL.Identifier("label"),
                       value=PLURALS(
                          source,
                          "bigFileDescription",
                          VARIABLE_REFERENCE("count"),
                          foreach=lambda n: REPLACE_IN_TEXT(
                              n,
                              dict(
                              ),
                          ),
                       )
                    ),
                ],
            )
        ]
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("cloudfile-uploading-notification"),
                value=PLURALS(
                    source,
                    "cloudFileUploadingNotification",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                            }
                        ),
                    ),
                ),
            )
        ],
    )
