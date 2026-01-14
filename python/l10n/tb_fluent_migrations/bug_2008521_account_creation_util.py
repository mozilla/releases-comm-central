# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2008521 - Migrate accountCreationUtil to fluent. part {index}"""
    target = reference = "mail/messenger/accountcreation/accountCreation.ftl"
    source = "mail/chrome/messenger/accountCreationUtil.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
hostname-syntax-error = {COPY(from_path, "hostname_syntax.error")}

alphanumdash-error = {COPY(from_path, "alphanumdash.error")}

allowed-value-error = {COPY(from_path, "allowed_value.error")}

url-scheme-error = {COPY(from_path, "url_scheme.error")}

url-parsing-error = {COPY(from_path, "url_parsing.error")}

string-empty-error = {COPY(from_path, "string_empty.error")}

boolean-error = {COPY(from_path, "boolean.error")}

no-number-error = {COPY(from_path, "no_number.error")}

number-too-large-error = {COPY(from_path, "number_too_large.error")}

number-too-small-error = {COPY(from_path, "number_too_small.error")}

emailaddress-syntax-error = {COPY(from_path, "emailaddress_syntax.error")}

cannot-contact-server-error = {COPY(from_path, "cannot_contact_server.error")}

bad-response-content-error = {COPY(from_path, "bad_response_content.error")}
            """,
            from_path=source,
        ),
    )
