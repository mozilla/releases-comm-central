/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Message.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::importance::Importance;
use crate::types::internet_message_header::InternetMessageHeader;
use crate::types::item_body::ItemBody;
use crate::types::outlook_item::{OutlookItem, OutlookItemSelection};
use crate::types::recipient::Recipient;
use crate::{Error, PropertyMap};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MessageSelection {
    BccRecipients,
    Body,
    BodyPreview,
    CcRecipients,
    ConversationId,
    ConversationIndex,
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
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Message<'a> {
    #[serde(flatten)]
    pub(crate) properties: PropertyMap<'a>,
}
impl<'a> From<PropertyMap<'a>> for Message<'a> {
    fn from(properties: PropertyMap<'a>) -> Self {
        Self { properties }
    }
}
impl<'a> Message<'a> {
    #[doc = r"Construct a new instance of this type with no properties set."]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    #[doc = "The Bcc: recipients for the message."]
    pub fn bcc_recipients(&'a self) -> Result<Vec<Recipient<'a>>, Error> {
        let val = self
            .properties
            .0
            .get("bccRecipients")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                Ok::<_, Error>(
                    PropertyMap(Cow::Borrowed(
                        v.as_object()
                            .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))?,
                    ))
                    .into(),
                )
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`bcc_recipients`](Self::bcc_recipients).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_bcc_recipients(mut self, val: Vec<Recipient<'_>>) -> Self {
        self.properties.0.to_mut().insert(
            "bccRecipients".to_string(),
            val.into_iter()
                .map(|v| Value::Object(v.properties.0.into_owned()))
                .collect(),
        );
        self
    }
    #[doc = "The body of the message.\n\n It can be in HTML or text format. Find out about safe HTML in a message body."]
    pub fn body(&'a self) -> Result<ItemBody<'a>, Error> {
        let val = self.properties.0.get("body").ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`body`](Self::body).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_body(mut self, val: ItemBody<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "body".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
    #[doc = "The first 255 characters of the message body.\n\n It is in text format."]
    pub fn body_preview(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("bodyPreview")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`body_preview`](Self::body_preview).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_body_preview(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("bodyPreview".to_string(), val.into());
        self
    }
    #[doc = "The Cc: recipients for the message."]
    pub fn cc_recipients(&'a self) -> Result<Vec<Recipient<'a>>, Error> {
        let val = self
            .properties
            .0
            .get("ccRecipients")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                Ok::<_, Error>(
                    PropertyMap(Cow::Borrowed(
                        v.as_object()
                            .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))?,
                    ))
                    .into(),
                )
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`cc_recipients`](Self::cc_recipients).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_cc_recipients(mut self, val: Vec<Recipient<'_>>) -> Self {
        self.properties.0.to_mut().insert(
            "ccRecipients".to_string(),
            val.into_iter()
                .map(|v| Value::Object(v.properties.0.into_owned()))
                .collect(),
        );
        self
    }
    #[doc = "The ID of the conversation the email belongs to."]
    pub fn conversation_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("conversationId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`conversation_id`](Self::conversation_id).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_conversation_id(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("conversationId".to_string(), val.into());
        self
    }
    #[doc = "Indicates the position of the message within the conversation."]
    pub fn conversation_index(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("conversationIndex")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`conversation_index`](Self::conversation_index).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_conversation_index(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("conversationIndex".to_string(), val.into());
        self
    }
    #[doc = "The owner of the mailbox from which the message is sent.\n\n In most cases, this value is the same as the sender property, except for sharing or delegation scenarios. The value must correspond to the actual mailbox used. Find out more about setting the from and sender properties of a message."]
    pub fn from(&'a self) -> Result<Recipient<'a>, Error> {
        let val = self.properties.0.get("from").ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`from`](Self::from).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_from(mut self, val: Recipient<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "from".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
    #[doc = "Indicates whether the message has attachments.\n\n This property doesn't include inline attachments, so if a message contains only inline attachments, this property is false. To verify the existence of inline attachments, parse the body property to look for a src attribute, such as <IMG src='cid:image001.jpg@01D26CD8.6C05F070'>."]
    pub fn has_attachments(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("hasAttachments")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`has_attachments`](Self::has_attachments).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_has_attachments(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("hasAttachments".to_string(), val.into());
        self
    }
    #[doc = "The importance of the message.\n\n The possible values are: low, normal, and high."]
    pub fn importance(&'a self) -> Result<Importance<'a>, Error> {
        let val = self.properties.0.get("importance").ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`importance`](Self::importance).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_importance(mut self, val: Importance<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "importance".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
    #[doc = "A collection of message headers defined by RFC5322.\n\n The set includes message headers indicating the network path taken by a message from the sender to the recipient. It can also contain custom message headers that hold app data for the message.  Returned only on applying a `$select` query option. Read-only."]
    pub fn internet_message_headers(&'a self) -> Result<Vec<InternetMessageHeader<'a>>, Error> {
        let val = self
            .properties
            .0
            .get("internetMessageHeaders")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                Ok::<_, Error>(
                    PropertyMap(Cow::Borrowed(
                        v.as_object()
                            .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))?,
                    ))
                    .into(),
                )
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`internet_message_headers`](Self::internet_message_headers).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_internet_message_headers(mut self, val: Vec<InternetMessageHeader<'_>>) -> Self {
        self.properties.0.to_mut().insert(
            "internetMessageHeaders".to_string(),
            val.into_iter()
                .map(|v| Value::Object(v.properties.0.into_owned()))
                .collect(),
        );
        self
    }
    #[doc = "The message ID in the format specified by RFC2822."]
    pub fn internet_message_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("internetMessageId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`internet_message_id`](Self::internet_message_id).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_internet_message_id(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("internetMessageId".to_string(), val.into());
        self
    }
    #[doc = "Indicates whether a read receipt is requested for the message."]
    pub fn is_delivery_receipt_requested(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("isDeliveryReceiptRequested")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_delivery_receipt_requested`](Self::is_delivery_receipt_requested).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_delivery_receipt_requested(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isDeliveryReceiptRequested".to_string(), val.into());
        self
    }
    #[doc = "Indicates whether the message is a draft.\n\n A message is a draft if it hasn't been sent yet."]
    pub fn is_draft(&self) -> Result<Option<bool>, Error> {
        let val = self.properties.0.get("isDraft").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_draft`](Self::is_draft).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_draft(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isDraft".to_string(), val.into());
        self
    }
    #[doc = "Indicates whether the message has been read."]
    pub fn is_read(&self) -> Result<Option<bool>, Error> {
        let val = self.properties.0.get("isRead").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_read`](Self::is_read).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_read(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isRead".to_string(), val.into());
        self
    }
    #[doc = "Indicates whether a read receipt is requested for the message."]
    pub fn is_read_receipt_requested(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .0
            .get("isReadReceiptRequested")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`is_read_receipt_requested`](Self::is_read_receipt_requested).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_is_read_receipt_requested(mut self, val: Option<bool>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("isReadReceiptRequested".to_string(), val.into());
        self
    }
    #[doc = "Accessor to inhereted properties from `OutlookItem`."]
    #[must_use]
    pub fn outlook_item(&'a self) -> OutlookItem<'a> {
        OutlookItem {
            properties: PropertyMap(Cow::Borrowed(&*self.properties.0)),
        }
    }
    #[doc = "Setter for [`outlook_item`](Self::outlook_item).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_outlook_item(mut self, mut val: OutlookItem<'_>) -> Self {
        self.properties.0.to_mut().append(val.properties.0.to_mut());
        self
    }
    #[doc = "The unique identifier for the message's parent mailFolder."]
    pub fn parent_folder_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("parentFolderId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`parent_folder_id`](Self::parent_folder_id).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_parent_folder_id(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("parentFolderId".to_string(), val.into());
        self
    }
    #[doc = "The date and time the message was received.\n\n  The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z."]
    pub fn received_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("receivedDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`received_date_time`](Self::received_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_received_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("receivedDateTime".to_string(), val.into());
        self
    }
    #[doc = "The email addresses to use when replying."]
    pub fn reply_to(&'a self) -> Result<Vec<Recipient<'a>>, Error> {
        let val = self.properties.0.get("replyTo").ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                Ok::<_, Error>(
                    PropertyMap(Cow::Borrowed(
                        v.as_object()
                            .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))?,
                    ))
                    .into(),
                )
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`reply_to`](Self::reply_to).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_reply_to(mut self, val: Vec<Recipient<'_>>) -> Self {
        self.properties.0.to_mut().insert(
            "replyTo".to_string(),
            val.into_iter()
                .map(|v| Value::Object(v.properties.0.into_owned()))
                .collect(),
        );
        self
    }
    #[doc = "The account that is used to generate the message.\n\n In most cases, this value is the same as the from property. You can set this property to a different value when sending a message from a shared mailbox, for a shared calendar, or as a delegate. In any case, the value must correspond to the actual mailbox used. Find out more about setting the from and sender properties of a message."]
    pub fn sender(&'a self) -> Result<Recipient<'a>, Error> {
        let val = self.properties.0.get("sender").ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`sender`](Self::sender).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_sender(mut self, val: Recipient<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "sender".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
    #[doc = "The date and time the message was sent.\n\n  The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z."]
    pub fn sent_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .0
            .get("sentDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`sent_date_time`](Self::sent_date_time).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_sent_date_time(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("sentDateTime".to_string(), val.into());
        self
    }
    #[doc = "The subject of the message."]
    pub fn subject(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("subject").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`subject`](Self::subject).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_subject(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("subject".to_string(), val.into());
        self
    }
    #[doc = "The To: recipients for the message."]
    pub fn to_recipients(&'a self) -> Result<Vec<Recipient<'a>>, Error> {
        let val = self
            .properties
            .0
            .get("toRecipients")
            .ok_or(Error::NotFound)?;
        val.as_array()
            .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?
            .iter()
            .map(|v| {
                Ok::<_, Error>(
                    PropertyMap(Cow::Borrowed(
                        v.as_object()
                            .ok_or_else(|| Error::UnexpectedResponse(format!("{v:?}")))?,
                    ))
                    .into(),
                )
            })
            .collect::<Result<_, _>>()
    }
    #[doc = "Setter for [`to_recipients`](Self::to_recipients).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_to_recipients(mut self, val: Vec<Recipient<'_>>) -> Self {
        self.properties.0.to_mut().insert(
            "toRecipients".to_string(),
            val.into_iter()
                .map(|v| Value::Object(v.properties.0.into_owned()))
                .collect(),
        );
        self
    }
    #[doc = "The part of the body of the message that is unique to the current message.\n\n uniqueBody is not returned by default but can be retrieved for a given message by use of the ?`$select`=uniqueBody query. It can be in HTML or text format."]
    pub fn unique_body(&'a self) -> Result<ItemBody<'a>, Error> {
        let val = self.properties.0.get("uniqueBody").ok_or(Error::NotFound)?;
        Ok(PropertyMap(Cow::Borrowed(
            val.as_object()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{val:?}")))?,
        ))
        .into())
    }
    #[doc = "Setter for [`unique_body`](Self::unique_body).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_unique_body(mut self, val: ItemBody<'_>) -> Self {
        self.properties.0.to_mut().insert(
            "uniqueBody".to_string(),
            Value::Object(val.properties.0.into_owned()),
        );
        self
    }
    #[doc = "The URL to open the message in Outlook on the web.You can append an ispopout argument to the end of the URL to change how the message is displayed.\n\n If ispopout is not present or if it is set to 1, then the message is shown in a popout window. If ispopout is set to 0, the browser shows the message in the Outlook on the web review pane.The message opens in the browser if you are signed in to your mailbox via Outlook on the web. You are prompted to sign in if you are not already signed in with the browser.This URL cannot be accessed from within an iFrame.NOTE: When using this URL to access a message from a mailbox with delegate permissions, both the signed-in user and the target mailbox must be in the same database region. For example, an error is returned when a user with a mailbox in the EUR (Europe) region attempts to access messages from a mailbox in the NAM (North America) region."]
    pub fn web_link(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.0.get("webLink").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{val:?}"))
        })?))
    }
    #[doc = "Setter for [`web_link`](Self::web_link).\n\nThis library makes no guarantees that Graph exposes this property as writable."]
    #[must_use]
    pub fn set_web_link(mut self, val: Option<String>) -> Self {
        self.properties
            .0
            .to_mut()
            .insert("webLink".to_string(), val.into());
        self
    }
}
