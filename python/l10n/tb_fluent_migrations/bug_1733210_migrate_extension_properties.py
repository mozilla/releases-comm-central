# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import
from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY


def migrate(ctx):
    """Bug 1733210 - Migrate app extension properties to Fluent, part {index}."""
    ctx.add_transforms(
        "mail/browser/appExtensionFields.ftl",
        "mail/browser/appExtensionFields.ftl",
        transforms_from(
            """
extension-thunderbird-compact-light-name = { COPY(from_path, "extension.thunderbird-compact-light@mozilla.org.name") }
extension-thunderbird-compact-light-description = { COPY(from_path, "extension.thunderbird-compact-light@mozilla.org.description") }
extension-thunderbird-compact-dark-name = { COPY(from_path, "extension.thunderbird-compact-dark@mozilla.org.name") }
extension-thunderbird-compact-dark-description= { COPY(from_path, "extension.thunderbird-compact-dark@mozilla.org.description") }
""",
            from_path="mail/chrome/messenger/app-extension-fields.properties",
        ),
    )
