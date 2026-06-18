# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2047659 - Title Fluent string migrations for auth and security types, part {index}."""

    target = reference = "mail/messenger/accountcreation/accountHub.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
account-hub-result-authentication-none = { COPY_PATTERN(from_path, "account-hub-result-auth-none") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-none") }

account-hub-result-authentication-password = { COPY_PATTERN(from_path, "account-hub-result-auth-password") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-password") }

account-hub-result-authentication-encrypted-password = { COPY_PATTERN(from_path, "account-hub-result-auth-encrypted-password") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-encrypted-password") }

account-hub-result-authentication-gssapi = { COPY_PATTERN(from_path, "account-hub-result-auth-gssapi") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-gssapi") }

account-hub-result-authentication-ntlm = { COPY_PATTERN(from_path, "account-hub-result-auth-ntlm") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-ntlm") }

account-hub-result-authentication-external = { COPY_PATTERN(from_path, "account-hub-result-auth-external") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-external") }

account-hub-result-authentication-oauth2 = { COPY_PATTERN(from_path, "account-hub-result-auth-oauth2") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-auth-oauth2") }

account-hub-result-security-no-encryption = { COPY_PATTERN(from_path, "account-hub-result-no-encryption") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-no-encryption") }

account-hub-result-security-ssl = { COPY_PATTERN(from_path, "account-hub-result-ssl") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-ssl") }

account-hub-result-security-starttls = { COPY_PATTERN(from_path, "account-hub-result-starttls") }
    .title = { COPY_PATTERN(from_path, "account-hub-result-starttls") }
            """,
            from_path=target,
        ),
    )
