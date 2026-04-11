# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY_PATTERN

def migrate(ctx):
    """Bug 1929702 - FTUE - Account Hub Migrate all strings from accountSetup.ftl to accountHub.ftl, part {index}."""

    source = "mail/messenger/accountcreation/accountSetup.ftl"
    target = reference = "mail/messenger/accountcreation/accountHub.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
account-hub-name-warning-icon =
    .title = { COPY_PATTERN(from_path, "account-setup-name-warning-icon.title") }

account-hub-email-label = { COPY_PATTERN(from_path, "account-setup-email-label") }
    .accesskey = { COPY_PATTERN(from_path, "account-setup-email-label.accesskey") }

account-hub-email-input =
    .placeholder = { COPY_PATTERN(from_path, "account-setup-email-input.placeholder") }

account-hub-email-warning-icon =
    .title = { COPY_PATTERN(from_path, "account-setup-email-warning-icon.title") }

account-hub-password-label = { COPY_PATTERN(from_path, "account-setup-password-label") }
    .accesskey = { COPY_PATTERN(from_path, "account-setup-password-label.accesskey") }
    .title = { COPY_PATTERN(from_path, "account-setup-password-label.title") }

account-hub-remember-password = { COPY_PATTERN(from_path, "account-setup-remember-password") }
    .accesskey = { COPY_PATTERN(from_path, "account-setup-remember-password.accesskey") }

account-hub-exchange-label = { COPY_PATTERN(from_path, "account-setup-exchange-label") }
    .accesskey = { COPY_PATTERN(from_path, "account-setup-exchange-label.accesskey") }

account-hub-installing-addon = { COPY_PATTERN(from_path, "account-setup-installing-addon") }

account-hub-success-addon = { COPY_PATTERN(from_path, "account-setup-success-addon") }

account-hub-success-half-manual = { COPY_PATTERN(from_path, "account-setup-success-half-manual") }

account-hub-result-no-encryption = { COPY_PATTERN(from_path, "account-setup-result-no-encryption") }

account-hub-result-ssl = { COPY_PATTERN(from_path, "account-setup-result-ssl") }

account-hub-result-starttls = { COPY_PATTERN(from_path, "account-setup-result-starttls") }

account-hub-credentials-wrong = { COPY_PATTERN(from_path, "account-setup-credentials-wrong") }

account-hub-find-settings-failed = { COPY_PATTERN(from_path, "account-setup-find-settings-failed") }

account-hub-exchange-config-unverifiable = { COPY_PATTERN(from_path, "account-setup-exchange-config-unverifiable") }

account-hub-advanced-setup-button = { COPY_PATTERN(from_path, "account-setup-advanced-setup-button") }
    .accesskey = { COPY_PATTERN(from_path, "account-setup-advanced-setup-button.accesskey") }

account-hub-exchange-dialog-question = { COPY_PATTERN(from_path, "exchange-dialog-question") }

account-hub-creation-error-title = { COPY_PATTERN(from_path, "account-setup-creation-error-title") }

account-hub-error-server-exists = { COPY_PATTERN(from_path, "account-setup-error-server-exists") }

account-hub-confirm-advanced-title = { COPY_PATTERN(from_path, "account-setup-confirm-advanced-title") }

account-hub-confirm-advanced-description = { COPY_PATTERN(from_path, "account-setup-confirm-advanced-description") }

account-hub-addon-install-title = { COPY_PATTERN(from_path, "account-setup-addon-install-title") }

account-hub-encryption-button = { COPY_PATTERN(from_path, "account-setup-encryption-button") }

account-hub-address-books-button = { COPY_PATTERN(from_path, "account-setup-address-books-button") }

account-hub-calendars-button = { COPY_PATTERN(from_path, "account-setup-calendars-button") }
            """,
            from_path=source,
        ),
    )
