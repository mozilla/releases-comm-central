# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1824288 - Add address book items to unified toolbar, part {index}."""

    target = reference = "mail/messenger/unifiedToolbarItems.ftl"
    from_path = "mail/messenger/addressbook/aboutAddressBook.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
toolbar-create-contact-label = {{COPY_PATTERN(from_path, "about-addressbook-toolbar-new-contact.label")}}

toolbar-create-address-book-label = {{COPY_PATTERN(from_path, "about-addressbook-toolbar-new-address-book.label")}}

toolbar-create-list-label = {{COPY_PATTERN(from_path, "about-addressbook-toolbar-new-list.label")}}

toolbar-import-contacts-label = {{COPY_PATTERN(from_path, "about-address-book-toolbar-import.label")}}

toolbar-new-address-book-popup-add-carddav-address-book =
    .label = {{COPY_PATTERN(from_path, "about-addressbook-toolbar-add-carddav-address-book.label")}}

toolbar-new-address-book-popup-add-ldap-address-book =
    .label = {{COPY_PATTERN(from_path, "about-addressbook-toolbar-add-ldap-address-book.label")}}
            """,
            from_path=from_path,
        ),
    )
