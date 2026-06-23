/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Message.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use crate::odata::ExpandOptions;
use crate::types::followup_flag::FollowupFlag;
use crate::types::importance::Importance;
use crate::types::internet_message_header::InternetMessageHeader;
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
pub enum MessageSelection {
    BccRecipients,
    Body,
    BodyPreview,
    CcRecipients,
    ConversationId,
    ConversationIndex,
    Flag,
    From,
    HasAttachments,
    Importance,
    InternetMessageHeaders,
    InternetMessageId,
    IsDeliveryReceiptRequested,
    IsDraft,
    IsRead,
    IsReadReceiptRequested,
    OutlookItem(OutlookItemSelection),
    ParentFolderId,
    ReceivedDateTime,
    ReplyTo,
    Sender,
    SentDateTime,
    Subject,
    ToRecipients,
    UniqueBody,
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
pub enum MessageExpand {
    SingleValueExtendedProperties(ExpandOptions<SingleValueLegacyExtendedPropertySelection>),
}
impl fmt::Display for MessageExpand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MessageExpand::SingleValueExtendedProperties(opt) => {
                opt.full_format(f, ExpandNames::from(self))
            }
        }
    }
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Message {
    #[doc = "The Bcc: recipients for the message."]
    pub bcc_recipients: Option<Vec<Recipient>>,
    #[doc = "The body of the message.\n\n It can be in HTML or text format. Find out about safe HTML in a message body."]
    pub body: Option<ItemBody>,
    #[doc = "The first 255 characters of the message body.\n\n It is in text format."]
    pub body_preview: Option<Nullable<String>>,
    #[doc = "The Cc: recipients for the message."]
    pub cc_recipients: Option<Vec<Recipient>>,
    #[doc = "The ID of the conversation the email belongs to."]
    pub conversation_id: Option<Nullable<String>>,
    #[doc = "Indicates the position of the message within the conversation."]
    pub conversation_index: Option<Nullable<String>>,
    #[doc = "Indicates the status, start date, due date, or completion date for the message."]
    pub flag: Option<FollowupFlag>,
    #[doc = "The owner of the mailbox from which the message is sent.\n\n In most cases, this value is the same as the sender property, except for sharing or delegation scenarios. The value must correspond to the actual mailbox used. Find out more about setting the from and sender properties of a message."]
    pub from: Option<Recipient>,
    #[doc = "Indicates whether the message has attachments.\n\n This property doesn't include inline attachments, so if a message contains only inline attachments, this property is false. To verify the existence of inline attachments, parse the body property to look for a src attribute, such as <IMG src='cid:image001.jpg@01D26CD8.6C05F070'>."]
    pub has_attachments: Option<Nullable<bool>>,
    #[doc = "The importance of the message.\n\n The possible values are: low, normal, and high."]
    pub importance: Option<Importance>,
    #[doc = "A collection of message headers defined by RFC5322.\n\n The set includes message headers indicating the network path taken by a message from the sender to the recipient. It can also contain custom message headers that hold app data for the message.  Returned only on applying a `$select` query option. Read-only."]
    pub internet_message_headers: Option<Vec<InternetMessageHeader>>,
    #[doc = "The message ID in the format specified by RFC2822."]
    pub internet_message_id: Option<Nullable<String>>,
    #[doc = "Indicates whether a read receipt is requested for the message."]
    pub is_delivery_receipt_requested: Option<Nullable<bool>>,
    #[doc = "Indicates whether the message is a draft.\n\n A message is a draft if it hasn't been sent yet."]
    pub is_draft: Option<Nullable<bool>>,
    #[doc = "Indicates whether the message has been read."]
    pub is_read: Option<Nullable<bool>>,
    #[doc = "Indicates whether a read receipt is requested for the message."]
    pub is_read_receipt_requested: Option<Nullable<bool>>,
    #[doc = "Inherited properties from `OutlookItem`."]
    #[serde(flatten)]
    pub outlook_item: OutlookItem,
    #[doc = "The unique identifier for the message's parent mailFolder."]
    pub parent_folder_id: Option<Nullable<String>>,
    #[doc = "The date and time the message was received.\n\n  The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z."]
    pub received_date_time: Option<Nullable<String>>,
    #[doc = "The email addresses to use when replying."]
    pub reply_to: Option<Vec<Recipient>>,
    #[doc = "The account that is used to generate the message.\n\n In most cases, this value is the same as the from property. You can set this property to a different value when sending a message from a shared mailbox, for a shared calendar, or as a delegate. In any case, the value must correspond to the actual mailbox used. Find out more about setting the from and sender properties of a message."]
    pub sender: Option<Recipient>,
    #[doc = "The date and time the message was sent.\n\n  The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z."]
    pub sent_date_time: Option<Nullable<String>>,
    #[doc = "The collection of single-value extended properties defined for the message.\n\n Nullable."]
    pub single_value_extended_properties: Option<Vec<SingleValueLegacyExtendedProperty>>,
    #[doc = "The subject of the message."]
    pub subject: Option<Nullable<String>>,
    #[doc = "The To: recipients for the message."]
    pub to_recipients: Option<Vec<Recipient>>,
    #[doc = "The part of the body of the message that is unique to the current message.\n\n uniqueBody is not returned by default but can be retrieved for a given message by use of the ?`$select`=uniqueBody query. It can be in HTML or text format."]
    pub unique_body: Option<ItemBody>,
    #[doc = "The URL to open the message in Outlook on the web.You can append an ispopout argument to the end of the URL to change how the message is displayed.\n\n If ispopout is not present or if it is set to 1, then the message is shown in a popout window. If ispopout is set to 0, the browser shows the message in the Outlook on the web review pane.The message opens in the browser if you are signed in to your mailbox via Outlook on the web. You are prompted to sign in if you are not already signed in with the browser.This URL cannot be accessed from within an iFrame.NOTE: When using this URL to access a message from a mailbox with delegate permissions, both the signed-in user and the target mailbox must be in the same database region. For example, an error is returned when a user with a mailbox in the EUR (Europe) region attempts to access messages from a mailbox in the NAM (North America) region."]
    pub web_link: Option<Nullable<String>>,
}
impl crate::extended_properties::SingleValueExtendedPropertiesExpand for MessageExpand {
    #[doc = r"Construct [`Self::SingleValueExtendedProperties`]."]
    fn svleps(options: ExpandOptions<SingleValueLegacyExtendedPropertySelection>) -> Self {
        Self::SingleValueExtendedProperties(options)
    }
}
impl crate::extended_properties::SingleValueExtendedPropertiesType for Message {
    #[doc = r"Wrapper for [`Self::single_value_extended_properties`]."]
    fn all_svleps(&self) -> Option<&Vec<SingleValueLegacyExtendedProperty>> {
        self.single_value_extended_properties.as_ref()
    }
}
