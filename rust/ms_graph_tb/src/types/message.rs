/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Message. Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::types::item_body::*;
use crate::Error;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::borrow::Cow;
use strum::Display;
#[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
pub enum MessageSelection {
    Body,
    BodyPreview,
    ConversationId,
    ConversationIndex,
    HasAttachments,
    InternetMessageId,
    IsDeliveryReceiptRequested,
    IsDraft,
    IsRead,
    IsReadReceiptRequested,
    ParentFolderId,
    ReceivedDateTime,
    SentDateTime,
    Subject,
    UniqueBody,
    WebLink,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
pub struct Message<'a> {
    #[serde(flatten)]
    pub(crate) properties: Cow<'a, Map<String, Value>>,
}
impl<'a> Message<'a> {
    #[doc = r"Internal constructor."]
    #[allow(dead_code)]
    pub(super) fn new(properties: &'a Map<String, Value>) -> Self {
        Message {
            properties: Cow::Borrowed(properties),
        }
    }
    #[doc = "The body of the message.\n\n It can be in HTML or text format. Find out about safe HTML in a message body."]
    pub fn body(&'a self) -> Result<ItemBody<'a>, Error> {
        let val = self.properties.get("body").ok_or(Error::NotFound)?;
        Ok(ItemBody::new(val.as_object().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The first 255 characters of the message body.\n\n It is in text format."]
    pub fn body_preview(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("bodyPreview").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The ID of the conversation the email belongs to."]
    pub fn conversation_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("conversationId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates the position of the message within the conversation."]
    pub fn conversation_index(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("conversationIndex")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates whether the message has attachments.\n\n This property doesn't include inline attachments, so if a message contains only inline attachments, this property is false. To verify the existence of inline attachments, parse the body property to look for a src attribute, such as <IMG src='cid:image001.jpg@01D26CD8.6C05F070'>."]
    pub fn has_attachments(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("hasAttachments")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The message ID in the format specified by RFC2822."]
    pub fn internet_message_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("internetMessageId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates whether a read receipt is requested for the message."]
    pub fn is_delivery_receipt_requested(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("isDeliveryReceiptRequested")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates whether the message is a draft.\n\n A message is a draft if it hasn't been sent yet."]
    pub fn is_draft(&self) -> Result<Option<bool>, Error> {
        let val = self.properties.get("isDraft").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates whether the message has been read."]
    pub fn is_read(&self) -> Result<Option<bool>, Error> {
        let val = self.properties.get("isRead").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "Indicates whether a read receipt is requested for the message."]
    pub fn is_read_receipt_requested(&self) -> Result<Option<bool>, Error> {
        let val = self
            .properties
            .get("isReadReceiptRequested")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_bool().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The unique identifier for the message's parent mailFolder."]
    pub fn parent_folder_id(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("parentFolderId")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The date and time the message was received.\n\n  The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z."]
    pub fn received_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self
            .properties
            .get("receivedDateTime")
            .ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The date and time the message was sent.\n\n  The date and time information uses ISO 8601 format and is always in UTC time. For example, midnight UTC on Jan 1, 2014 is 2014-01-01T00:00:00Z."]
    pub fn sent_date_time(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("sentDateTime").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The subject of the message."]
    pub fn subject(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("subject").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The part of the body of the message that is unique to the current message.\n\n uniqueBody is not returned by default but can be retrieved for a given message by use of the ?`$select`=uniqueBody query. It can be in HTML or text format."]
    pub fn unique_body(&'a self) -> Result<ItemBody<'a>, Error> {
        let val = self.properties.get("uniqueBody").ok_or(Error::NotFound)?;
        Ok(ItemBody::new(val.as_object().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
    #[doc = "The URL to open the message in Outlook on the web.You can append an ispopout argument to the end of the URL to change how the message is displayed.\n\n If ispopout is not present or if it is set to 1, then the message is shown in a popout window. If ispopout is set to 0, the browser shows the message in the Outlook on the web review pane.The message opens in the browser if you are signed in to your mailbox via Outlook on the web. You are prompted to sign in if you are not already signed in with the browser.This URL cannot be accessed from within an iFrame.NOTE: When using this URL to access a message from a mailbox with delegate permissions, both the signed-in user and the target mailbox must be in the same database region. For example, an error is returned when a user with a mailbox in the EUR (Europe) region attempts to access messages from a mailbox in the NAM (North America) region."]
    pub fn web_link(&self) -> Result<Option<&str>, Error> {
        let val = self.properties.get("webLink").ok_or(Error::NotFound)?;
        if val.is_null() {
            return Ok(None);
        }
        Ok(Some(val.as_str().ok_or_else(|| {
            Error::UnexpectedResponse(format!("{:?}", val))
        })?))
    }
}
