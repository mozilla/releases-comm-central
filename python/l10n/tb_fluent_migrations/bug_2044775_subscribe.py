# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY

def migrate(ctx):
    """Bug 2044775 - Migrate subscribe.dtd and properties to Fluent, part {index}"""

    target = reference = "mail/messenger/subscribe.ftl"
    source_dtd = "mail/chrome/messenger/subscribe.dtd"
    source_prop = "mail/chrome/messenger/subscribe.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
subscribe-window-title = { COPY(source_dtd, "subscribeDialog.title") }

subscribe-server = { COPY(source_dtd, "server.label") }
    .accesskey = { COPY(source_dtd, "server.accesskey") }

subscribe-namefield = { COPY(source_dtd, "namefield.label") }
    .accesskey = { COPY(source_dtd, "namefield.accesskey") }

subscribe-new-groups-tab =
    .label = { COPY(source_dtd, "newGroupsTab.label") }
    .accesskey = { COPY(source_dtd, "newGroupsTab.accesskey") }

subscribe-refresh-button =
    .label = { COPY(source_dtd, "refreshButton.label") }
    .accesskey = { COPY(source_dtd, "refreshButton.accesskey") }

subscribe-stop-button =
    .label = { COPY(source_dtd, "stopButton.label") }
    .accesskey = { COPY(source_dtd, "stopButton.accesskey") }

subscribe-label-nntp = { COPY(source_prop, "subscribeLabel-nntp") }

subscribe-label-imap = { COPY(source_prop, "subscribeLabel-imap") }

subscribe-current-list-tab-nntp =
    .label = { COPY(source_prop, "currentListTab-nntp.label") }
    .accesskey = { COPY(source_prop, "currentListTab-nntp.accesskey") }

subscribe-current-list-tab-imap =
    .label = { COPY(source_prop, "currentListTab-imap.label") }
    .accesskey = { COPY(source_prop, "currentListTab-imap.accesskey") }

subscribe-please-wait = { COPY(source_prop, "pleaseWaitString") }

subscribe-offline = { COPY(source_prop, "offlineState") }

subscribe-error-populating = { COPY(source_prop, "errorPopulating") }
            """,
            source_dtd=source_dtd,
            source_prop=source_prop,
        ),
    )
