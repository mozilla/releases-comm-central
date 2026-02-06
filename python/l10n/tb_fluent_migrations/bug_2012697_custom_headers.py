# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from

def migrate(ctx):
    """Bug 2012697 - Migrate Custom Headers dialog to Fluent. part {index}"""

    dtd_source = "mail/chrome/messenger/CustomHeaders.dtd"
    filter_prop_source = "mail/chrome/messenger/filter.properties"
    custom_prop_source = "mail/chrome/messenger/custom.properties"
    ftl_target = "mail/messenger/customHeaders.ftl"

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
custom-headers-window = { COPY(dtd_source, "window.title") }

custom-headers-new-msg-header =
    .value = { COPY(dtd_source, "newMsgHeader.label") }
    .accesskey = { COPY(dtd_source, "newMsgHeader.accesskey") }

custom-headers-add-button =
    .label = { COPY(dtd_source, "addButton.label") }
    .accesskey = { COPY(dtd_source, "addButton.accesskey") }

custom-headers-remove-button =
    .label = { COPY(dtd_source, "removeButton.label") }
    .accesskey = { COPY(dtd_source, "removeButton.accesskey") }

custom-headers-overflow = { COPY(filter_prop_source, "customHeaderOverflow") }

custom-headers-colon-in-header = { COPY(custom_prop_source, "colonInHeaderName") }
            """,
            dtd_source=dtd_source,
            filter_prop_source=filter_prop_source,
            custom_prop_source=custom_prop_source,
        ),
    )
