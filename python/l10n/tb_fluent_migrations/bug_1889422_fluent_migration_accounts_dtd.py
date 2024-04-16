# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/
import fluent.migratetb.helpers
from fluent.migratetb import COPY

from fluent.migratetb.helpers import TERM_REFERENCE
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import MESSAGE_REFERENCE


about_replacements = dict(
    {
        "&brandShortName;": TERM_REFERENCE("brand-short-name"),
        "&accountManager.newAccount.label;": MESSAGE_REFERENCE("new-account-label"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Convert chat accounts.dtd to Fluent. part {index}"""
    target = reference = "chat/accounts.ftl"
    source = "chat/accounts.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
new-account-label = { COPY(from_path, "accountManager.newAccount.label") }
accounts-window-title = { COPY(from_path, "accountsWindow.title") }
account-manager-new-account =
    .label = { new-account-label }
    .accesskey = { COPY(from_path, "accountManager.newAccount.accesskey") }
account-manager-close =
    .label = { COPY(from_path, "accountManager.close.label") }
    .accesskey = { COPY(from_path, "accountManager.close.accesskey") }
account-manager-close-command =
    .key = { COPY(from_path, "accountManager.close.commandkey") }
# This title must be short, displayed with a big font size
account-manager-no-account-title = { COPY(from_path, "accountManager.noAccount.title") }

account-manager-no-account-description = { REPLACE(from_path, "accountManager.noAccount.description", about_replacements) }
account-auto-sign-on =
    .label = { COPY(from_path, "account.autoSignOn.label") }
    .accesskey = { COPY(from_path, "account.autoSignOn.accesskey") }
account-connect =
    .label = { COPY(from_path, "account.connect.label") }
    .accesskey = { COPY(from_path, "account.connect.accesskey") }
account-disconnect =
    .label = { COPY(from_path, "account.disconnect.label") }
    .accesskey = { COPY(from_path, "account.disconnect.accesskey") }
account-edit =
    .label = { COPY(from_path, "account.edit.label") }
    .accesskey = { COPY(from_path, "account.edit.accesskey") }
account-cancel-reconnection =
    .label = { COPY(from_path, "account.cancelReconnection.label") }
    .accesskey = { COPY(from_path, "account.cancelReconnection.accesskey") }
account-copy-debug-log =
    .label = { COPY(from_path, "account.copyDebugLog.label") }
    .accesskey = { COPY(from_path, "account.copyDebugLog.accesskey") }
account-connecting =
    .value = { COPY(from_path, "account.connecting") }
account-disconnecting =
    .value = { COPY(from_path, "account.disconnecting") }
account-disconnected =
    .value = { COPY(from_path, "account.disconnected") }
""",
            from_path=source,
            about_replacements=about_replacements,
        ),
    )
