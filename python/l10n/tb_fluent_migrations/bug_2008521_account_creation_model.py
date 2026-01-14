# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2008521 - Migrate accountCreationModel to fluent. part {index}"""
    target = reference = "mail/messenger/accountcreation/accountCreation.ftl"
    source = "mail/chrome/messenger/accountCreationModel.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
no-email-provider-error = {COPY(from_path, "no_emailProvider.error")}

outgoing-not-smtp-error = {COPY(from_path, "outgoing_not_smtp.error")}

cannot-login-error = {COPY(from_path, "cannot_login.error")}

cannot-find-server-error = {COPY(from_path, "cannot_find_server.error")}

no-autodiscover-error = {COPY(from_path, "no_autodiscover.error")}
            """,
            from_path=source,
        ),
    )
