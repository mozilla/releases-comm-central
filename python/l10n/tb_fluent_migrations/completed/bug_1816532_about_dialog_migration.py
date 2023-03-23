# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/


from fluent.migratetb.helpers import TERM_REFERENCE
from fluent.migratetb.helpers import transforms_from


# This can't just be a straight up literal dict (eg: {"a":"b"}) because the
# validator fails... so make it a function call that returns a dict.. it works
about_replacements = dict(
    {
        "&brandShorterName;": TERM_REFERENCE("brand-shorter-name"),
        "&brandShortName;": TERM_REFERENCE("brand-short-name"),
        "&vendorShortName;": TERM_REFERENCE("vendor-short-name"),
    }
)


def migrate(ctx):
    """Bug 1816532 - Migrate aboutDialog.dtd strings to Fluent, part {index}"""
    target = reference = "mail/messenger/aboutDialog.ftl"
    source = "mail/chrome/messenger/aboutDialog.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
release-notes-link = { COPY(source, "releaseNotes.link") }

update-check-for-updates-button = { COPY(source, "update.checkForUpdatesButton.label") }
    .accesskey = { COPY(source, "update.checkForUpdatesButton.accesskey") }

update-update-button = { REPLACE(source, "update.updateButton.label3", about_replacements) }
    .accesskey = { COPY(source, "update.updateButton.accesskey") }

update-checking-for-updates = { COPY(source, "update.checkingForUpdates") }

update-downloading-message = { COPY(source, "update.downloading.start") }<span data-l10n-name="download-status"></span>

update-applying = { COPY(source, "update.applying") }

update-downloading = <img data-l10n-name="icon"/>{ COPY(source, "update.downloading.start") }<span data-l10n-name="download-status"></hspan>

update-failed = { COPY(source, "update.failed.start") }<a data-l10n-name="failed-link">{ COPY(source, "update.failed.linkText") }</a>

update-admin-disabled = { COPY(source, "update.adminDisabled") }

update-no-updates-found = { REPLACE(source, "update.noUpdatesFound", about_replacements) }

update-other-instance-handling-updates = { REPLACE(source, "update.otherInstanceHandlingUpdates", about_replacements) }

update-unsupported = { COPY(source, "update.unsupported.start") }<a data-l10n-name="unsupported-link">{ COPY(source, "update.unsupported.linkText") }</a>

update-restarting = { COPY(source, "update.restarting") }

channel-description = { COPY(source, "channel.description.start") }<span data-l10n-name="current-channel">{ $channel }</span> { COPY(source, "channel.description.end", trim: "True") }

warning-desc-version = { REPLACE(source, "warningDesc.version", about_replacements) }

warning-desc-telemetry = { REPLACE(source, "warningDesc.telemetryDesc", about_replacements) }

community-exp = <a data-l10n-name="community-exp-mozilla-link">
    { REPLACE(source, "community.exp.mozillaLink", about_replacements) }</a>
    { COPY(source, "community.exp.middle") }<a data-l10n-name="community-exp-credits-link">
    { COPY(source, "community.exp.creditsLink") }</a>
    { COPY(source, "community.exp.end") }

community-2 = { REPLACE(source, "community.start2", about_replacements) }<a data-l10n-name="community-mozilla-link">
    { REPLACE(source, "community.mozillaLink", about_replacements) }</a>
    { COPY(source, "community.middle2") }<a data-l10n-name="community-credits-link">
    { COPY(source, "community.creditsLink") }</a>
    { COPY(source, "community.end3") }

about-helpus = { COPY(source, "helpus.start") }<a data-l10n-name="helpus-donate-link">
    { COPY(source, "helpus.donateLink") }</a> or <a data-l10n-name="helpus-get-involved-link">
    { COPY(source, "helpus.getInvolvedLink") }</a>

bottom-links-license = { COPY(source, "bottomLinks.license") }

bottom-links-rights = { COPY(source, "bottomLinks.rights") }

bottom-links-privacy = { COPY(source, "bottomLinks.privacy") }

cmd-close-mac-command-key =
    .key = { COPY(source, "cmdCloseMac.commandKey") }
""",
            source=source,
            about_replacements=about_replacements,
        ),
    )
