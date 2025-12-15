# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE
from fluent.migratetb.transforms import PLURALS, REPLACE_IN_TEXT


def migrate(ctx):
    """Bug 2000811 - Migrate SearchDialog.dtd and search.properties to fluent. part {index}"""

    source_dtd = "mail/chrome/messenger/SearchDialog.dtd"
    source_search_prop = "mail/chrome/messenger/search.properties"
    source_ab_prop = "mail/chrome/messenger/addressbook/addressBook.properties"

    dest = ref = "mail/messenger/searchDialog.ftl"
    dest_ab = ref_ab = "mail/messenger/addressbook/aboutAddressBook.ftl"

    ctx.add_transforms(
        dest,
        ref,
        transforms_from(
            """
search-button =
  .label = { COPY(from_path, "labelForSearchButton") }
  .accesskey = { COPY(from_path, "labelForSearchButton.accesskey") }

stop-button =
  .label = { COPY(from_path, "labelForStopButton") }
  .accesskey = { COPY(from_path, "labelForStopButton.accesskey") }

searching-message =
  .value = { COPY(from_path, "searchingMessage") }

no-matches-found =
  .value = { COPY(from_path, "noMatchesFound") }
            """,
            from_path=source_search_prop,
        ),
    )

    ctx.add_transforms(
        dest,
        ref,
        [
            FTL.Message(
                id=FTL.Identifier("matches-found"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("value"),
                        value=PLURALS(
                            source_search_prop,
                            "matchesFound",
                            VARIABLE_REFERENCE("count"),
                            lambda text: REPLACE_IN_TEXT(
                                text,
                                {"#1": VARIABLE_REFERENCE("count")},
                            ),
                        ),
                    )
                ],
            ),
        ],
    ),

    ctx.add_transforms(
        dest,
        ref,
        transforms_from(
            """
search-heading =
  .value = { COPY(from_path, "searchHeading.label") }
  .accesskey = { COPY(from_path, "searchHeading.accesskey") }

search-subfolders =
  .label = { COPY(from_path, "searchSubfolders.label") }
  .accesskey = { COPY(from_path, "searchSubfolders.accesskey") }

search-on-server =
  .label = { COPY(from_path, "searchOnServer.label") }
  .accesskey = { COPY(from_path, "searchOnServer.accesskey") }

clear-button =
  .label = { COPY(from_path, "resetButton.label") }
  .accesskey = { COPY(from_path, "resetButton.accesskey") }

open-button =
  .label = { COPY(from_path, "openButton.label") }
  .accesskey = { COPY(from_path, "openButton.accesskey") }

delete-button =
  .label = { COPY(from_path, "deleteButton.label") }
  .accesskey = { COPY(from_path, "deleteButton.accesskey") }

search-dialog-title = { COPY(from_path, "searchDialogTitle.label") }

move-button =
  .label = { COPY(from_path, "moveButton.label") }
  .accesskey = { COPY(from_path, "moveButton.accesskey") }

close-cmd =
  .key = { COPY(from_path, "closeCmd.key") }

open-in-folder =
  .label = { COPY(from_path, "openInFolder.label") }
  .accesskey = { COPY(from_path, "openInFolder.accesskey") }

save-as-vf-button =
  .label = { COPY(from_path, "saveAsVFButton.label") }
  .accesskey = { COPY(from_path, "saveAsVFButton.accesskey") }
            """,
            from_path=source_dtd,
        ),
    )

    ctx.add_transforms(
        dest_ab,
        ref_ab,
        transforms_from(
            """
ab-search-dialog-no-matches-found =
  .value = { COPY(from_path, "noMatchFound") }
            """,
            from_path=source_ab_prop,
        ),
    )

    ctx.add_transforms(
        dest_ab,
        ref_ab,
        [
            FTL.Message(
                id=FTL.Identifier("ab-search-dialog-matches-found"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("value"),
                        value=PLURALS(
                            source_ab_prop,
                            "matchesFound1",
                            VARIABLE_REFERENCE("count"),
                            lambda text: REPLACE_IN_TEXT(
                                text,
                                {"#1": VARIABLE_REFERENCE("count")},
                            ),
                        ),
                    )
                ],
            )
        ],
    ),

    ctx.add_transforms(
        dest_ab,
        ref_ab,
        transforms_from(
            """
ab-search-dialog-search-button =
  .label = { COPY(from_path, "labelForSearchButton") }
  .accesskey = { COPY(from_path, "labelForSearchButton.accesskey") }
            """,
            from_path=source_search_prop,
        ),
    )

    ctx.add_transforms(
        dest_ab,
        ref_ab,
        transforms_from(
            """
ab-search-dialog-reset-button =
  .label = { COPY(from_path, "resetButton.label") }
  .accesskey = { COPY(from_path, "resetButton.accesskey") }

ab-search-dialog-search-heading =
  .label = { COPY(from_path, "abSearchHeading.label") }
  .accesskey = { COPY(from_path, "abSearchHeading.accesskey") }

ab-search-dialog-properties-button =
  .label = { COPY(from_path, "propertiesButton.label") }
  .accesskey = { COPY(from_path, "propertiesButton.accesskey") }

ab-search-dialog-compose-button =
  .label = { COPY(from_path, "composeButton.label") }
  .accesskey = { COPY(from_path, "composeButton.accesskey") }

ab-search-dialog-delete-button =
  .label = { COPY(from_path, "deleteCardButton.label") }
  .accesskey = { COPY(from_path, "deleteCardButton.accesskey") }

ab-search-dialog-title = { COPY(from_path, "abSearchDialogTitle.label") }

ab-search-dialog-close-cmd =
  .key = { COPY(from_path, "closeCmd.key") }
            """,
            from_path=source_dtd,
        ),
    )
