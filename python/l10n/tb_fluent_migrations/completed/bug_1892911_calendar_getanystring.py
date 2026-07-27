# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, TERM_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, COPY, COPY_PATTERN


def migrate(ctx):
    """Bug 1892911 - Migrate cal.l10n.getAnyString() usages to Fluent, part {index}"""

    ctx.add_transforms(
        "calendar/calendar/calendar-creation.ftl",
        "calendar/calendar/calendar-creation.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("calendar-creation-mapi-login-text"),
                value=REPLACE(
                    "mail/chrome/messenger-mapi/mapi.properties",
                    "loginText",
                    {"%1$S": VARIABLE_REFERENCE("location")},
                ),
            ),
        ],
    )

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        [
            # too-new-schema-error-text is renamed to too-new-dbschema-error-text because the
            # content changed: $hostApplication variable replaced by -brand-short-name term.
            # Not migrated to avoid carrying forward broken variable references.
            FTL.Message(
                id=FTL.Identifier("imip-bar-unsupported-text"),
                value=REPLACE(
                    "calendar/chrome/lightning/lightning.properties",
                    "imipBarUnsupportedText2",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-auth-enter-password-for"),
                value=REPLACE(
                    "toolkit/chrome/global/commonDialogs.properties",
                    "EnterPasswordFor",
                    {
                        "%1$S": VARIABLE_REFERENCE("username"),
                        "%2$S": VARIABLE_REFERENCE("location"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-auth-enter-user-password-for"),
                value=REPLACE(
                    "toolkit/chrome/global/commonDialogs.properties",
                    "EnterUserPasswordFor2",
                    {"%1$S": VARIABLE_REFERENCE("location")},
                ),
            ),
        ],
    )
