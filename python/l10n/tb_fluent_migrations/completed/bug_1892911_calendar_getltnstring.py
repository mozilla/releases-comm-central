# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE
from fluent.migratetb.transforms import REPLACE

SOURCE = "calendar/chrome/lightning/lightning.properties"


def migrate(ctx):
    """Bug 1892911 - Migrate cal.l10n.getLtnString() usages to Fluent, part {index}"""

    target = reference = "calendar/calendar/calendar-itip.ftl"

    # Strings without parameters.
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
calendar-tab-title-calendar = { COPY(source, "tabTitleCalendar") }
calendar-tab-title-tasks = { COPY(source, "tabTitleTasks") }

imip-html-header = { COPY(source, "imipHtml.header") }
imip-html-summary = { COPY(source, "imipHtml.summary") }
imip-html-location = { COPY(source, "imipHtml.location") }
imip-html-when = { COPY(source, "imipHtml.when") }
imip-html-organizer = { COPY(source, "imipHtml.organizer") }
imip-html-description = { COPY(source, "imipHtml.description") }
imip-html-attachments = { COPY(source, "imipHtml.attachments") }
imip-html-comment = { COPY(source, "imipHtml.comment") }
imip-html-attendees = { COPY(source, "imipHtml.attendees") }
imip-html-url = { COPY(source, "imipHtml.url") }
imip-html-canceled-occurrences = { COPY(source, "imipHtml.canceledOccurrences") }
imip-html-modified-occurrences = { COPY(source, "imipHtml.modifiedOccurrences") }

imip-added-item-to-cal = { COPY(source, "imipAddedItemToCal2") }
imip-canceled-item = { COPY(source, "imipCanceledItem2") }
imip-updated-item = { COPY(source, "imipUpdatedItem2") }

imip-bar-cancel-text = { COPY(source, "imipBarCancelText") }
imip-bar-counter-error-text = { COPY(source, "imipBarCounterErrorText") }
imip-bar-counter-previous-version-text = { COPY(source, "imipBarCounterPreviousVersionText") }
imip-bar-counter-text = { COPY(source, "imipBarCounterText") }
imip-bar-disallowed-counter-text = { COPY(source, "imipBarDisallowedCounterText") }
imip-bar-decline-counter-text = { COPY(source, "imipBarDeclineCounterText") }
imip-bar-refresh-text = { COPY(source, "imipBarRefreshText") }
imip-bar-publish-text = { COPY(source, "imipBarPublishText") }
imip-bar-request-text = { COPY(source, "imipBarRequestText") }
imip-bar-sent-text = { COPY(source, "imipBarSentText") }
imip-bar-sent-but-removed-text = { COPY(source, "imipBarSentButRemovedText") }
imip-bar-update-text = { COPY(source, "imipBarUpdateText") }
imip-bar-update-multiple-text = { COPY(source, "imipBarUpdateMultipleText") }
imip-bar-update-series-text = { COPY(source, "imipBarUpdateSeriesText") }
imip-bar-already-processed-text = { COPY(source, "imipBarAlreadyProcessedText") }
imip-bar-processed-needs-action = { COPY(source, "imipBarProcessedNeedsAction") }
imip-bar-processed-multiple-needs-action = { COPY(source, "imipBarProcessedMultipleNeedsAction") }
imip-bar-processed-series-needs-action = { COPY(source, "imipBarProcessedSeriesNeedsAction") }
imip-bar-reply-text = { COPY(source, "imipBarReplyText") }
imip-bar-reply-to-not-existing-item = { COPY(source, "imipBarReplyToNotExistingItem") }
imip-bar-calendar-deactivated = { COPY(source, "imipBarCalendarDeactivated") }
imip-bar-not-writable = { COPY(source, "imipBarNotWritable") }
imip-no-calendar-available = { COPY(source, "imipNoCalendarAvailable") }

imip-send-mail-title = { COPY(source, "imipSendMail.title") }
imip-send-mail-text = { COPY(source, "imipSendMail.text") }
imip-no-identity = { COPY(source, "imipNoIdentity") }
no-identity-selected-notification = { COPY(source, "noIdentitySelectedNotification") }

confirm-process-invitation = { COPY(source, "confirmProcessInvitation") }
confirm-process-invitation-title = { COPY(source, "confirmProcessInvitationTitle") }
            """,
            source=SOURCE,
        ),
    )

    # Strings with parameters.
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("imip-html-new-location"),
                value=REPLACE(SOURCE, "imipHtml.newLocation", {"%1$S": VARIABLE_REFERENCE("location")}),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-delegated-from"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeDelegatedFrom",
                    {"%1$S": VARIABLE_REFERENCE("delegators")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-combined"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendee.combined",
                    {"%1$S": VARIABLE_REFERENCE("role"), "%2$S": VARIABLE_REFERENCE("partStat")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-role-chair"),
                value=REPLACE(
                    SOURCE, "imipHtml.attendeeRole2.CHAIR", {"%1$S": VARIABLE_REFERENCE("userType")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-role-non-participant"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeRole2.NON-PARTICIPANT",
                    {"%1$S": VARIABLE_REFERENCE("userType")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-role-opt-participant"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeRole2.OPT-PARTICIPANT",
                    {"%1$S": VARIABLE_REFERENCE("userType")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-role-req-participant"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeRole2.REQ-PARTICIPANT",
                    {"%1$S": VARIABLE_REFERENCE("userType")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-part-stat-accepted"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeePartStat2.ACCEPTED",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-part-stat-declined"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeePartStat2.DECLINED",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-part-stat-delegated"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeePartStat2.DELEGATED",
                    {
                        "%1$S": VARIABLE_REFERENCE("attendee"),
                        "%2$S": VARIABLE_REFERENCE("delegatees"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-part-stat-needs-action"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeePartStat2.NEEDS-ACTION",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-part-stat-tentative"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeePartStat2.TENTATIVE",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-user-type-individual"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeUserType2.INDIVIDUAL",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-user-type-group"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeUserType2.GROUP",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-user-type-resource"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeUserType2.RESOURCE",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-user-type-room"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeUserType2.ROOM",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-html-attendee-user-type-unknown"),
                value=REPLACE(
                    SOURCE,
                    "imipHtml.attendeeUserType2.UNKNOWN",
                    {"%1$S": VARIABLE_REFERENCE("attendee")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-bar-reply-to-recently-removed-item"),
                value=REPLACE(
                    SOURCE,
                    "imipBarReplyToRecentlyRemovedItem",
                    {"%1$S": VARIABLE_REFERENCE("deletionTime")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("imip-bar-processing-failed"),
                value=REPLACE(
                    SOURCE, "imipBarProcessingFailed", {"%1$S": VARIABLE_REFERENCE("status")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("invitations-link-label"),
                value=REPLACE(SOURCE, "invitationsLink.label", {"%1$S": VARIABLE_REFERENCE("count")}),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-request-subject"),
                value=REPLACE(SOURCE, "itipRequestSubject2", {"%1$S": VARIABLE_REFERENCE("summary")}),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-request-updated-subject"),
                value=REPLACE(
                    SOURCE, "itipRequestUpdatedSubject2", {"%1$S": VARIABLE_REFERENCE("summary")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-request-body"),
                value=REPLACE(
                    SOURCE,
                    "itipRequestBody",
                    {"%1$S": VARIABLE_REFERENCE("organizer"), "%2$S": VARIABLE_REFERENCE("summary")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-cancel-subject"),
                value=REPLACE(SOURCE, "itipCancelSubject2", {"%1$S": VARIABLE_REFERENCE("summary")}),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-cancel-body"),
                value=REPLACE(
                    SOURCE,
                    "itipCancelBody",
                    {"%1$S": VARIABLE_REFERENCE("organizer"), "%2$S": VARIABLE_REFERENCE("summary")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-counter-body"),
                value=REPLACE(
                    SOURCE,
                    "itipCounterBody",
                    {"%1$S": VARIABLE_REFERENCE("attendee"), "%2$S": VARIABLE_REFERENCE("summary")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-decline-counter-body"),
                value=REPLACE(
                    SOURCE,
                    "itipDeclineCounterBody",
                    {"%1$S": VARIABLE_REFERENCE("organizer"), "%2$S": VARIABLE_REFERENCE("summary")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-decline-counter-subject"),
                value=REPLACE(
                    SOURCE, "itipDeclineCounterSubject", {"%1$S": VARIABLE_REFERENCE("summary")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-reply-subject"),
                value=REPLACE(SOURCE, "itipReplySubject2", {"%1$S": VARIABLE_REFERENCE("summary")}),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-reply-subject-accept"),
                value=REPLACE(
                    SOURCE, "itipReplySubjectAccept2", {"%1$S": VARIABLE_REFERENCE("summary")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-reply-subject-decline"),
                value=REPLACE(
                    SOURCE, "itipReplySubjectDecline2", {"%1$S": VARIABLE_REFERENCE("summary")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-reply-subject-tentative"),
                value=REPLACE(
                    SOURCE, "itipReplySubjectTentative2", {"%1$S": VARIABLE_REFERENCE("summary")}
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-reply-body-accept"),
                value=REPLACE(SOURCE, "itipReplyBodyAccept", {"%1$S": VARIABLE_REFERENCE("attendee")}),
            ),
            FTL.Message(
                id=FTL.Identifier("itip-reply-body-decline"),
                value=REPLACE(
                    SOURCE, "itipReplyBodyDecline", {"%1$S": VARIABLE_REFERENCE("attendee")}
                ),
            ),
        ],
    )
