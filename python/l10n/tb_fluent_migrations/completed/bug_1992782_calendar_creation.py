# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1992782 - Migrate calendarCreation.dtd to fluent. part {index}"""
    from_calendar = "calendar/chrome/calendar/calendarCreation.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar-creation.ftl",
        "calendar/calendar/calendar-creation.ftl",
        transforms_from(
            """
calendar-creation-wizard-title = { COPY(from_path, "wizard.title") }

calendar-creation-initial-description = { COPY(from_path, "initialpage.description") }
calendar-creation-initial-computer =
    .label = { COPY(from_path, "initialpage.computer.label") }
calendar-creation-initial-network =
    .label = { COPY(from_path, "initialpage.network.label") }

calendar-creation-username =
    .value = { COPY(from_path, "locationpage.username.label") }

calendar-creation-panel-local-settings =
    .buttonlabelaccept = { COPY(from_path, "buttons.create.label") }
    .buttonaccesskeyaccept = { COPY(from_path, "buttons.create.accesskey") }
    .buttonlabelextra2 = { COPY(from_path, "buttons.back.label") }
    .buttonaccesskeyextra2 = { COPY(from_path, "buttons.back.accesskey") }

calendar-creation-panel-addon-settings =
    .buttonlabelaccept = { COPY(from_path, "buttons.create.label") }
    .buttonaccesskeyaccept = { COPY(from_path, "buttons.create.accesskey") }
    .buttonlabelextra2 = { COPY(from_path, "buttons.back.label") }
    .buttonaccesskeyextra2 = { COPY(from_path, "buttons.back.accesskey") }

calendar-creation-panel-network-settings =
    .buttonlabelaccept = { COPY(from_path, "buttons.find.label") }
    .buttonaccesskeyaccept = { COPY(from_path, "buttons.find.accesskey") }
    .buttonlabelextra2 = { COPY(from_path, "buttons.back.label") }
    .buttonaccesskeyextra2 = { COPY(from_path, "buttons.back.accesskey") }

calendar-creation-panel-select-calendars =
    .buttonlabelaccept = { COPY(from_path, "buttons.subscribe.label") }
    .buttonaccesskeyaccept = { COPY(from_path, "buttons.subscribe.accesskey") }
    .buttonlabelextra2 = { COPY(from_path, "buttons.back.label") }
    .buttonaccesskeyextra2 = { COPY(from_path, "buttons.back.accesskey") }

calendar-creation-type =
    .value = { COPY(from_path, "calendartype.label") }

calendar-creation-location =
    .value = { COPY(from_path, "location.label") }

calendar-creation-location-placeholder =
    .placeholder = { COPY(from_path, "location.placeholder") }
    .default-placeholder = { COPY(from_path, "location.placeholder") }

calendar-creation-network-nocredentials =
    .label = { COPY(from_path, "network.nocredentials.label") }

calendar-creation-network-loading = { COPY(from_path, "network.loading.description") }
calendar-creation-network-notfound = { COPY(from_path, "network.notfound.description") }
calendar-creation-network-authfail = { COPY(from_path, "network.authfail.description") }
calendar-creation-network-certerror = { COPY(from_path, "network.certerror.description") }

calendar-creation-network-subscribe-single = { COPY(from_path, "network.subscribe.single.description") }
calendar-creation-network-subscribe-multiple = { COPY(from_path, "network.subscribe.multiple.description") }
            """,
            from_path=from_calendar,
        ),
    )
