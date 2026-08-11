/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Event.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use crate::odata::ExpandOptions;
use crate::types::attendee::Attendee;
use crate::types::calendar::{Calendar, CalendarSelection};
use crate::types::date_time_time_zone::DateTimeTimeZone;
use crate::types::importance::Importance;
use crate::types::item_body::ItemBody;
use crate::types::outlook_item::{OutlookItem, OutlookItemSelection};
use crate::types::recipient::Recipient;
use crate::types::single_value_legacy_extended_property::{
    SingleValueLegacyExtendedProperty, SingleValueLegacyExtendedPropertySelection,
};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use std::fmt;
use strum::Display;
#[doc = r"Properties that can be selected from this type."]
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum EventSelection {
    AllowNewTimeProposals,
    Attendees,
    Body,
    BodyPreview,
    CancelledOccurrences,
    End,
    HasAttachments,
    HideAttendees,
    ICalUId,
    Importance,
    IsAllDay,
    IsCancelled,
    IsDraft,
    IsOnlineMeeting,
    IsOrganizer,
    IsReminderOn,
    OnlineMeetingUrl,
    Organizer,
    OriginalEndTimeZone,
    OriginalStart,
    OriginalStartTimeZone,
    OutlookItem(OutlookItemSelection),
    ReminderMinutesBeforeStart,
    ResponseRequested,
    SeriesMasterId,
    Start,
    Subject,
    TransactionId,
    WebLink,
}
#[doc = r"Types that are syntactically valid to expand for this type."]
#[doc = r""]
#[doc = r" Being present in this enum does not guarantee Graph can expand"]
#[doc = r" the property for any particular path."]
#[derive(Clone, Debug, strum :: EnumDiscriminants)]
#[strum_discriminants(name(ExpandNames))]
#[strum_discriminants(vis(pub(self)))]
#[strum_discriminants(derive(Display))]
#[strum_discriminants(strum(serialize_all = "camelCase"))]
pub enum EventExpand {
    Calendar(ExpandOptions<CalendarSelection>),
    ExceptionOccurrences(ExpandOptions<EventSelection>),
    Instances(ExpandOptions<EventSelection>),
    SingleValueExtendedProperties(ExpandOptions<SingleValueLegacyExtendedPropertySelection>),
}
impl fmt::Display for EventExpand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EventExpand::Calendar(opt) => opt.full_format(f, ExpandNames::from(self)),
            EventExpand::ExceptionOccurrences(opt) => opt.full_format(f, ExpandNames::from(self)),
            EventExpand::Instances(opt) => opt.full_format(f, ExpandNames::from(self)),
            EventExpand::SingleValueExtendedProperties(opt) => {
                opt.full_format(f, ExpandNames::from(self))
            }
        }
    }
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Event {
    #[doc = "true if the meeting organizer allows invitees to propose a new time when responding; otherwise, false.\n\n Optional. The default is true."]
    pub allow_new_time_proposals: Option<Nullable<bool>>,
    #[doc = "The collection of attendees for the event."]
    pub attendees: Option<Vec<Attendee>>,
    #[doc = "The body of the message associated with the event.\n\n It can be in HTML or text format."]
    pub body: Option<ItemBody>,
    #[doc = "The preview of the message associated with the event.\n\n It's in text format."]
    pub body_preview: Option<Nullable<String>>,
    #[doc = "The calendar that contains the event.\n\n Navigation property. Read-only."]
    pub calendar: Option<Calendar>,
    #[doc = "Contains occurrenceId property values of canceled instances in a recurring series, if the event is the series master.\n\n Instances in a recurring series that are canceled are called canceled occurences.Returned only on `$select` in a Get operation which specifies the ID (seriesMasterId property value) of a series master event."]
    pub cancelled_occurrences: Option<Vec<String>>,
    #[doc = "The date, time, and time zone that the event ends.\n\n By default, the end time is in UTC."]
    pub end: Option<DateTimeTimeZone>,
    #[doc = "Contains the id property values of the event instances that are exceptions in a recurring series.Exceptions can differ from other occurrences in a recurring series, such as the subject, start or end times, or attendees.\n\n Exceptions don't include canceled occurrences.Returned only on `$select` and `$expand` in a GET operation that specifies the ID (seriesMasterId property value) of a series master event."]
    pub exception_occurrences: Option<Vec<Event>>,
    #[doc = "Set to true if the event has attachments."]
    pub has_attachments: Option<Nullable<bool>>,
    #[doc = "When set to true, each attendee only sees themselves in the meeting request and meeting Tracking list.\n\n The default is false."]
    pub hide_attendees: Option<Nullable<bool>>,
    #[doc = "A unique identifier for an event across calendars.\n\n This ID is different for each occurrence in a recurring series. Read-only."]
    pub i_cal_u_id: Option<Nullable<String>>,
    #[doc = "The importance of the event.\n\n The possible values are: low, normal, high."]
    pub importance: Option<Importance>,
    #[doc = "The occurrences of a recurring series, if the event is a series master.\n\n This property includes occurrences that are part of the recurrence pattern, and exceptions modified, but doesn't include occurrences canceled from the series. Navigation property. Read-only. Nullable."]
    pub instances: Option<Vec<Event>>,
    #[doc = "Set to true if the event lasts all day.\n\n If true, regardless of whether it's a single-day or multi-day event, start, and endtime must be set to midnight and be in the same time zone."]
    pub is_all_day: Option<Nullable<bool>>,
    #[doc = "Set to true if the event has been canceled."]
    pub is_cancelled: Option<Nullable<bool>>,
    #[doc = "Set to true if the user has updated the meeting in Outlook but hasn't sent the updates to attendees.\n\n Set to false if all changes are sent, or if the event is an appointment without any attendees."]
    pub is_draft: Option<Nullable<bool>>,
    #[doc = "True if this event has online meeting information (that is, onlineMeeting points to an onlineMeetingInfo resource), false otherwise.\n\n Default is false (onlineMeeting is null). Optional.  After you set isOnlineMeeting to true, Microsoft Graph initializes onlineMeeting. Subsequently, Outlook ignores any further changes to isOnlineMeeting, and the meeting remains available online."]
    pub is_online_meeting: Option<Nullable<bool>>,
    #[doc = "Set to true if the calendar owner (specified by the owner property of the calendar) is the organizer of the event (specified by the organizer property of the event).\n\n It also applies if a delegate organized the event on behalf of the owner."]
    pub is_organizer: Option<Nullable<bool>>,
    #[doc = "Set to true if an alert is set to remind the user of the event."]
    pub is_reminder_on: Option<Nullable<bool>>,
    #[doc = "A URL for an online meeting.\n\n The property is set only when an organizer specifies in Outlook that an event is an online meeting such as Skype. Read-only.To access the URL to join an online meeting, use joinUrl which is exposed via the onlineMeeting property of the event. The onlineMeetingUrl property will be deprecated in the future."]
    pub online_meeting_url: Option<Nullable<String>>,
    #[doc = "The organizer of the event."]
    pub organizer: Option<Recipient>,
    #[doc = "The end time zone that was set when the event was created.\n\n A value of tzone://Microsoft/Custom indicates that a legacy custom time zone was set in desktop Outlook."]
    pub original_end_time_zone: Option<Nullable<String>>,
    #[doc = "Represents the start time of an event when it's initially created as an occurrence or exception in a recurring series.\n\n This property is not returned for events that are single instances. Its date and time information is expressed in ISO 8601 format and is always in UTC. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z"]
    pub original_start: Option<Nullable<String>>,
    #[doc = "The start time zone that was set when the event was created.\n\n A value of tzone://Microsoft/Custom indicates that a legacy custom time zone was set in desktop Outlook."]
    pub original_start_time_zone: Option<Nullable<String>>,
    #[doc = "Inherited properties from `OutlookItem`."]
    #[serde(flatten)]
    pub outlook_item: OutlookItem,
    #[doc = "The number of minutes before the event start time that the reminder alert occurs."]
    pub reminder_minutes_before_start: Option<Nullable<i32>>,
    #[doc = "Default is true, which represents the organizer would like an invitee to send a response to the event."]
    pub response_requested: Option<Nullable<bool>>,
    #[doc = "The ID for the recurring series master item, if this event is part of a recurring series."]
    pub series_master_id: Option<Nullable<String>>,
    #[doc = "The collection of single-value extended properties defined for the event.\n\n Read-only. Nullable."]
    pub single_value_extended_properties: Option<Vec<SingleValueLegacyExtendedProperty>>,
    #[doc = "The start date, time, and time zone of the event.\n\n By default, the start time is in UTC."]
    pub start: Option<DateTimeTimeZone>,
    #[doc = "The text of the event's subject line."]
    pub subject: Option<Nullable<String>>,
    #[doc = "A custom identifier specified by a client app for the server to avoid redundant POST operations in case of client retries to create the same event.\n\n It's useful when low network connectivity causes the client to time out before receiving a response from the server for the client's prior create-event request. After you set transactionId when creating an event, you can't change transactionId in a subsequent update. This property is only returned in a response payload if an app has set it. Optional."]
    pub transaction_id: Option<Nullable<String>>,
    #[doc = "The URL to open the event in Outlook on the web.Outlook on the web opens the event in the browser if you are signed in to your mailbox.\n\n Otherwise, Outlook on the web prompts you to sign in.This URL can't be accessed from within an iFrame."]
    pub web_link: Option<Nullable<String>>,
}
impl crate::extended_properties::SingleValueExtendedPropertiesExpand for EventExpand {
    #[doc = r"Construct [`Self::SingleValueExtendedProperties`]."]
    fn svleps(options: ExpandOptions<SingleValueLegacyExtendedPropertySelection>) -> Self {
        Self::SingleValueExtendedProperties(options)
    }
}
impl crate::extended_properties::SingleValueExtendedPropertiesType for Event {
    #[doc = r"Wrapper for [`Self::single_value_extended_properties`]."]
    fn all_svleps(&self) -> Option<&Vec<SingleValueLegacyExtendedProperty>> {
        self.single_value_extended_properties.as_ref()
    }
}
