/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::ops::{Deref, DerefMut};

use serde::{Deserialize, Deserializer};
use time::format_description::well_known::Iso8601;
use xml_struct::XmlSerialize;

pub(crate) const MESSAGES_NS_URI: &str =
    "http://schemas.microsoft.com/exchange/services/2006/messages";
pub(crate) const SOAP_NS_URI: &str = "http://schemas.xmlsoap.org/soap/envelope/";
pub(crate) const TYPES_NS_URI: &str = "http://schemas.microsoft.com/exchange/services/2006/types";

/// The folder properties which should be included in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/foldershape>.
#[derive(Clone, Debug, Default, XmlSerialize)]
pub struct FolderShape {
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,
}

/// The item properties which should be included in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemshape>.
#[derive(Clone, Debug, Default, XmlSerialize)]
pub struct ItemShape {
    /// The base set of properties to include, which may be extended by other
    /// fields.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/baseshape>
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,

    /// Whether the MIME content of an item should be included.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/includemimecontent>
    #[xml_struct(ns_prefix = "t")]
    pub include_mime_content: Option<bool>,

    /// A list of properties which should be included in addition to those
    /// implied by other fields.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/additionalproperties>
    #[xml_struct(ns_prefix = "t")]
    pub additional_properties: Option<Vec<PathToElement>>,
}

/// An identifier for a property on an Exchange entity.
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum PathToElement {
    /// An identifier for an extended MAPI property.
    ///
    /// The full set of constraints on which properties may or must be set
    /// together are not expressed in the structure of this variant. Please see
    /// Microsoft's documentation for further details.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedfielduri>
    // TODO: We can represent in a friendlier way with an enum, probably. A
    // property is fully specified by a type and either:
    // - A property set ID plus property name/ID, or
    // - A property tag.
    // https://github.com/thunderbird/ews-rs/issues/9
    ExtendedFieldURI {
        /// A well-known identifier for a property set.
        #[xml_struct(attribute)]
        distinguished_property_set_id: Option<DistinguishedPropertySet>,

        /// A GUID representing a property set.
        // TODO: This could use a strong type for representing a GUID.
        #[xml_struct(attribute)]
        property_set_id: Option<String>,

        /// Specifies a property by integer tag.
        // TODO: This should use an integer type, but it seems a hex
        // representation is preferred, and we should restrict the possible
        // values per the docs.
        #[xml_struct(attribute)]
        property_tag: Option<String>,

        /// The name of a property within a specified property set.
        #[xml_struct(attribute)]
        property_name: Option<String>,

        /// The dispatch ID of a property within a specified property set.
        #[xml_struct(attribute)]
        property_id: Option<String>,

        /// The value type of the desired property.
        #[xml_struct(attribute)]
        property_type: PropertyType,
    },

    /// An identifier for a property given by a well-known string.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/fielduri>
    #[allow(non_snake_case)]
    FieldURI {
        /// The well-known string.
        // TODO: Adjust xml_struct to support field renaming to avoid non-snake
        // case identifiers.
        // https://github.com/thunderbird/xml-struct-rs/issues/6
        // TODO: We could use an enum for this field. It's just large and not
        // worth typing out by hand.
        #[xml_struct(attribute)]
        field_URI: String,
    },

    /// An identifier for a specific element of a dictionary-based property.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/indexedfielduri>
    #[allow(non_snake_case)]
    IndexedFieldURI {
        /// The well-known string identifier of the property.
        #[xml_struct(attribute)]
        field_URI: String,

        /// The member within the dictionary to access.
        #[xml_struct(attribute)]
        field_index: String,
    },
}

/// The identifier for an extended MAPI property.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedfielduri>
// N.B.: This is copied from `PathToElement::ExtendedFieldURI`,
// which follows the same structure. However, xml-struct doesn't currently
// support using a nested structure to define an element's attributes, see
// https://github.com/thunderbird/xml-struct-rs/issues/9
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct ExtendedFieldURI {
    /// A well-known identifier for a property set.
    #[xml_struct(attribute)]
    pub distinguished_property_set_id: Option<DistinguishedPropertySet>,

    /// A GUID representing a property set.
    // TODO: This could use a strong type for representing a GUID.
    #[xml_struct(attribute)]
    pub property_set_id: Option<String>,

    /// Specifies a property by integer tag.
    #[xml_struct(attribute)]
    pub property_tag: Option<String>,

    /// The name of a property within a specified property set.
    #[xml_struct(attribute)]
    pub property_name: Option<String>,

    /// The dispatch ID of a property within a specified property set.
    #[xml_struct(attribute)]
    pub property_id: Option<String>,

    /// The value type of the desired property.
    #[xml_struct(attribute)]
    pub property_type: PropertyType,
}

/// A well-known MAPI property set identifier.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedfielduri#distinguishedpropertysetid-attribute>
#[derive(Clone, Copy, Debug, Deserialize, XmlSerialize)]
#[xml_struct(text)]
pub enum DistinguishedPropertySet {
    Address,
    Appointment,
    CalendarAssistant,
    Common,
    InternetHeaders,
    Meeting,
    PublicStrings,
    Sharing,
    Task,
    UnifiedMessaging,
}

/// The action an Exchange server will take upon creating a `Message` item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem#messagedisposition-attribute>
/// and <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem#messagedisposition-attribute>
#[derive(Clone, Copy, Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum MessageDisposition {
    SaveOnly,
    SendOnly,
    SendAndSaveCopy,
}

/// The type of the value of a MAPI property.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedfielduri#propertytype-attribute>
#[derive(Clone, Copy, Debug, Deserialize, XmlSerialize)]
#[xml_struct(text)]
pub enum PropertyType {
    ApplicationTime,
    ApplicationTimeArray,
    Binary,
    BinaryArray,
    Boolean,
    CLSID,
    CLSIDArray,
    Currency,
    CurrencyArray,
    Double,
    DoubleArray,
    Float,
    FloatArray,
    Integer,
    IntegerArray,
    Long,
    LongArray,
    Short,
    ShortArray,
    SystemTime,
    SystemTimeArray,
    String,
    StringArray,
}

/// The base set of properties to be returned in response to our request.
/// Additional properties may be specified by the parent element.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/baseshape>.
#[derive(Clone, Copy, Debug, Default, XmlSerialize)]
#[xml_struct(text)]
pub enum BaseShape {
    /// Only the IDs of any items or folders returned.
    IdOnly,

    /// The default set of properties for the relevant item or folder.
    ///
    /// The properties returned are dependent on the type of item or folder. See
    /// the EWS documentation for details.
    #[default]
    Default,

    /// All properties of an item or folder.
    AllProperties,
}

/// The success/failure status of an operation.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
pub enum ResponseClass {
    Success,
    Warning,
    Error,
}

/// An error code describing the error encountered in processing a request, if
/// any.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/responsecode>
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ResponseCode(pub String);

impl<T> From<T> for ResponseCode
where
    T: ToString,
{
    fn from(value: T) -> Self {
        Self(value.to_string())
    }
}

/// An identifier for an Exchange folder.
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum BaseFolderId {
    /// An identifier for an arbitrary folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderid>.
    FolderId {
        #[xml_struct(attribute)]
        id: String,

        #[xml_struct(attribute)]
        change_key: Option<String>,
    },

    /// An identifier for referencing a folder by name, e.g. "inbox" or
    /// "junkemail".
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/distinguishedfolderid>.
    DistinguishedFolderId {
        #[xml_struct(attribute)]
        id: String,

        #[xml_struct(attribute)]
        change_key: Option<String>,
    },
}

/// The unique identifier of a folder.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folderid>
#[derive(Clone, Debug, Deserialize, PartialEq, XmlSerialize)]
pub struct FolderId {
    #[serde(rename = "@Id")]
    pub id: String,

    #[serde(rename = "@ChangeKey")]
    pub change_key: Option<String>,
}

/// An identifier for an Exchange item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemids>
// N.B.: Commented-out variants are not yet implemented.
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum BaseItemId {
    /// An identifier for a standard Exchange item.
    ItemId {
        #[xml_struct(attribute)]
        id: String,

        #[xml_struct(attribute)]
        change_key: Option<String>,
    },
    // OccurrenceItemId { .. }
    // RecurringMasterItemId { .. }
}

/// The unique identifier of an item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemid>
#[derive(Clone, Debug, Deserialize, XmlSerialize, PartialEq)]
pub struct ItemId {
    #[xml_struct(attribute)]
    #[serde(rename = "@Id")]
    pub id: String,

    #[serde(rename = "@ChangeKey")]
    #[xml_struct(attribute)]
    pub change_key: Option<String>,
}

/// The representation of a folder in an EWS operation.
#[derive(Clone, Debug, Deserialize)]
pub enum Folder {
    /// A calendar folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/calendarfolder>
    #[serde(rename_all = "PascalCase")]
    CalendarFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },

    /// A contacts folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contactsfolder>
    #[serde(rename_all = "PascalCase")]
    ContactsFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },

    /// A folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/folder>
    #[serde(rename_all = "PascalCase")]
    Folder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
        unread_count: Option<u32>,
    },

    /// A search folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/searchfolder>
    #[serde(rename_all = "PascalCase")]
    SearchFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },

    /// A task folder in a mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/tasksfolder>
    #[serde(rename_all = "PascalCase")]
    TasksFolder {
        folder_id: FolderId,
        parent_folder_id: Option<FolderId>,
        folder_class: Option<String>,
        display_name: Option<String>,
        total_count: Option<u32>,
        child_folder_count: Option<u32>,
    },
}

/// An array of items.
#[derive(Clone, Debug, Deserialize)]
pub struct Items {
    #[serde(rename = "$value", default)]
    pub inner: Vec<RealItem>,
}

/// An item which may appear as the result of a request to read or modify an
/// Exchange item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/items>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
#[xml_struct(variant_ns_prefix = "t")]
pub enum RealItem {
    Message(Message),
}

/// An item which may appear in an item-based attachment.
///
/// See [`Attachment::ItemAttachment`] for details.
// N.B.: Commented-out variants are not yet implemented.
#[non_exhaustive]
#[derive(Clone, Debug, Deserialize)]
pub enum AttachmentItem {
    // Item(Item),
    Message(Message),
    // CalendarItem(CalendarItem),
    // Contact(Contact),
    // Task(Task),
    // MeetingMessage(MeetingMessage),
    // MeetingRequest(MeetingRequest),
    // MeetingResponse(MeetingResponse),
    // MeetingCancellation(MeetingCancellation),
}

/// A date and time with second precision.
// `time` provides an `Option<OffsetDateTime>` deserializer, but it does not
// work with map fields which may be omitted, as in our case.
#[derive(Clone, Debug, Deserialize)]
pub struct DateTime(#[serde(with = "time::serde::iso8601")] pub time::OffsetDateTime);

impl XmlSerialize for DateTime {
    /// Serializes a `DateTime` as an XML text content node by formatting the
    /// inner [`time::OffsetDateTime`] as an ISO 8601-compliant string.
    fn serialize_child_nodes<W>(
        &self,
        writer: &mut quick_xml::Writer<W>,
    ) -> Result<(), xml_struct::Error>
    where
        W: std::io::Write,
    {
        let time = self
            .0
            .format(&Iso8601::DEFAULT)
            .map_err(|err| xml_struct::Error::Value(err.into()))?;

        time.serialize_child_nodes(writer)
    }
}

/// An email message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/message-ex15websvcsotherref>
#[derive(Clone, Debug, Default, Deserialize, XmlSerialize)]
#[serde(rename_all = "PascalCase")]
pub struct Message {
    /// The MIME content of the item.
    #[xml_struct(ns_prefix = "t")]
    pub mime_content: Option<MimeContent>,

    /// The item's Exchange identifier.
    #[xml_struct(ns_prefix = "t")]
    pub item_id: Option<ItemId>,

    /// The identifier for the containing folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/parentfolderid>
    #[xml_struct(ns_prefix = "t")]
    pub parent_folder_id: Option<FolderId>,

    /// The Exchange class value of the item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemclass>
    #[xml_struct(ns_prefix = "t")]
    pub item_class: Option<String>,

    /// The subject of the item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/subject>
    #[xml_struct(ns_prefix = "t")]
    pub subject: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub sensitivity: Option<Sensitivity>,

    #[xml_struct(ns_prefix = "t")]
    pub body: Option<Body>,

    #[xml_struct(ns_prefix = "t")]
    pub attachments: Option<Attachments>,

    #[xml_struct(ns_prefix = "t")]
    pub date_time_received: Option<DateTime>,

    #[xml_struct(ns_prefix = "t")]
    pub size: Option<usize>,

    /// A list of categories describing an item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/categories-ex15websvcsotherref>
    #[xml_struct(ns_prefix = "t")]
    pub categories: Option<Vec<StringElement>>,

    // Extended MAPI properties to set on the message.
    #[xml_struct(ns_prefix = "t")]
    pub extended_property: Option<Vec<ExtendedProperty>>,

    #[xml_struct(ns_prefix = "t")]
    pub importance: Option<Importance>,

    #[xml_struct(ns_prefix = "t")]
    pub in_reply_to: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub is_submitted: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub is_draft: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub is_from_me: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub is_resend: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub is_unmodified: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub internet_message_headers: Option<InternetMessageHeaders>,

    #[xml_struct(ns_prefix = "t")]
    pub date_time_sent: Option<DateTime>,

    #[xml_struct(ns_prefix = "t")]
    pub date_time_created: Option<DateTime>,

    #[xml_struct(ns_prefix = "t")]
    pub reminder_due_by: Option<DateTime>,

    #[xml_struct(ns_prefix = "t")]
    pub reminder_is_set: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub reminder_minutes_before_start: Option<usize>,

    #[xml_struct(ns_prefix = "t")]
    pub display_cc: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub display_to: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub has_attachments: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub culture: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub sender: Option<Recipient>,

    #[xml_struct(ns_prefix = "t")]
    pub to_recipients: Option<ArrayOfRecipients>,

    #[xml_struct(ns_prefix = "t")]
    pub cc_recipients: Option<ArrayOfRecipients>,

    #[xml_struct(ns_prefix = "t")]
    pub bcc_recipients: Option<ArrayOfRecipients>,

    #[xml_struct(ns_prefix = "t")]
    pub is_read_receipt_requested: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub is_delivery_receipt_requested: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub conversation_index: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub conversation_topic: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub from: Option<Recipient>,

    #[xml_struct(ns_prefix = "t")]
    pub internet_message_id: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub is_read: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub is_response_requested: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub reply_to: Option<Recipient>,

    #[xml_struct(ns_prefix = "t")]
    pub received_by: Option<Recipient>,

    #[xml_struct(ns_prefix = "t")]
    pub received_representing: Option<Recipient>,

    #[xml_struct(ns_prefix = "t")]
    pub last_modified_name: Option<String>,

    #[xml_struct(ns_prefix = "t")]
    pub last_modified_time: Option<DateTime>,

    #[xml_struct(ns_prefix = "t")]
    pub is_associated: Option<bool>,

    #[xml_struct(ns_prefix = "t")]
    pub conversation_id: Option<ItemId>,
}

/// An extended MAPI property to set on the message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedproperty>
#[allow(non_snake_case)]
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct ExtendedProperty {
    #[xml_struct(ns_prefix = "t")]
    pub extended_field_URI: ExtendedFieldURI,

    #[xml_struct(ns_prefix = "t")]
    pub value: String,
}

/// A list of attachments.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/attachments-ex15websvcsotherref>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct Attachments {
    #[serde(rename = "$value")]
    #[xml_struct(flatten)]
    pub inner: Vec<Attachment>,
}

/// A newtype around a vector of `Recipient`s, that is deserialized using
/// `deserialize_recipients`.
#[derive(Clone, Debug, Default, Deserialize, XmlSerialize)]
pub struct ArrayOfRecipients(
    #[serde(deserialize_with = "deserialize_recipients")] pub Vec<Recipient>,
);

impl Deref for ArrayOfRecipients {
    type Target = Vec<Recipient>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for ArrayOfRecipients {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/// A single mailbox.
#[derive(Clone, Debug, Deserialize, XmlSerialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct Recipient {
    #[xml_struct(ns_prefix = "t")]
    pub mailbox: Mailbox,
}

/// Deserializes a list of recipients.
///
/// `quick-xml`'s `serde` implementation requires the presence of an
/// intermediate type when dealing with lists, and this is not compatible with
/// our model for serialization.
///
/// We could directly deserialize into a `Vec<Mailbox>`, which would also
/// simplify this function a bit, but this would mean using different models
/// to represent single vs. multiple recipient(s).
fn deserialize_recipients<'de, D>(deserializer: D) -> Result<Vec<Recipient>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Clone, Debug, Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct MailboxSequence {
        mailbox: Vec<Mailbox>,
    }

    let seq = MailboxSequence::deserialize(deserializer)?;

    Ok(seq
        .mailbox
        .into_iter()
        .map(|mailbox| Recipient { mailbox })
        .collect())
}

/// A list of Internet Message Format headers.
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
#[serde(rename_all = "PascalCase")]
pub struct InternetMessageHeaders {
    pub internet_message_header: Vec<InternetMessageHeader>,
}

/// A reference to a user or address which can send or receive mail.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mailbox>
#[derive(Clone, Debug, Default, Deserialize, XmlSerialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct Mailbox {
    /// The name of this mailbox's user.
    #[xml_struct(ns_prefix = "t")]
    pub name: Option<String>,

    /// The email address for this mailbox.
    #[xml_struct(ns_prefix = "t")]
    pub email_address: String,

    /// The protocol used in routing to this mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/routingtype-emailaddress>
    pub routing_type: Option<RoutingType>,

    /// The type of sender/recipient represented by this mailbox.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mailboxtype>
    pub mailbox_type: Option<MailboxType>,

    /// An identifier for a contact or list of contacts corresponding to this
    /// mailbox.
    pub item_id: Option<ItemId>,
}

/// A protocol used in routing mail.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/routingtype-emailaddress>
#[derive(Clone, Copy, Debug, Default, Deserialize, XmlSerialize, PartialEq)]
#[xml_struct(text)]
pub enum RoutingType {
    #[default]
    SMTP,
    EX,
}

/// The type of sender or recipient a mailbox represents.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mailboxtype>
#[derive(Clone, Copy, Debug, Deserialize, XmlSerialize, PartialEq)]
#[xml_struct(text)]
pub enum MailboxType {
    Mailbox,
    PublicDL,
    PrivateDL,
    Contact,
    PublicFolder,
    Unknown,
    OneOff,
    GroupMailbox,
}

/// The priority level of an item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/importance>
#[derive(Clone, Copy, Debug, Deserialize, XmlSerialize)]
#[xml_struct(text)]
pub enum Importance {
    Low,
    Normal,
    High,
}

/// A string value.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/string>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
#[serde(rename_all = "PascalCase")]
pub struct StringElement {
    /// The string content.
    pub string: String,
}

/// The sensitivity of the contents of an item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/sensitivity>
#[derive(Clone, Copy, Debug, Deserialize, XmlSerialize)]
#[xml_struct(text)]
pub enum Sensitivity {
    Normal,
    Personal,
    Private,
    Confidential,
}

/// The body of an item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/body>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct Body {
    /// The content type of the body.
    #[serde(rename = "@BodyType")]
    #[xml_struct(attribute)]
    pub body_type: BodyType,

    /// Whether the body has been truncated.
    #[serde(rename = "@IsTruncated")]
    #[xml_struct(attribute)]
    pub is_truncated: Option<bool>,

    /// The content of the body.
    // TODO: It's not immediately obvious why this tag may be empty, but it has
    // been encountered in real world responses. Needs a closer look.
    #[serde(rename = "$text")]
    #[xml_struct(flatten)]
    pub content: Option<String>,
}

/// The content type of an item's body.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/body>
#[derive(Clone, Copy, Debug, Deserialize, XmlSerialize)]
#[xml_struct(text)]
pub enum BodyType {
    HTML,
    Text,
}

/// An attachment to an Exchange item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/attachments-ex15websvcsotherref>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub enum Attachment {
    /// An attachment containing an Exchange item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemattachment>
    #[serde(rename_all = "PascalCase")]
    ItemAttachment {
        /// An identifier for the attachment.
        attachment_id: AttachmentId,

        /// The name of the attachment.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/name-attachmenttype>
        name: String,

        /// The MIME type of the attachment's content.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contenttype>
        content_type: String,

        /// An arbitrary identifier for the attachment.
        ///
        /// This field is not set by Exchange and is intended for use by
        /// external applications.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contentid>
        content_id: Option<String>,

        /// A URI representing the location of the attachment's content.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contentlocation>
        content_location: Option<String>,

        /// The size of the attachment's content in bytes.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/size>
        size: Option<usize>,

        /// The most recent modification time for the attachment.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/lastmodifiedtime>
        last_modified_time: Option<DateTime>,

        /// Whether the attachment appears inline in the item body.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/isinline>
        is_inline: Option<bool>,
        // XXX: With this field in place, parsing will fail if there is no
        // `AttachmentItem` in the response.
        // See https://github.com/tafia/quick-xml/issues/683
        // /// The attached item.
        // #[serde(rename = "$value")]
        // content: Option<AttachmentItem>,
    },

    /// An attachment containing a file.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/fileattachment>
    #[serde(rename_all = "PascalCase")]
    FileAttachment {
        /// An identifier for the attachment.
        attachment_id: AttachmentId,

        /// The name of the attachment.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/name-attachmenttype>
        name: String,

        /// The MIME type of the attachment's content.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contenttype>
        content_type: String,

        /// An arbitrary identifier for the attachment.
        ///
        /// This field is not set by Exchange and is intended for use by
        /// external applications.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contentid>
        content_id: Option<String>,

        /// A URI representing the location of the attachment's content.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/contentlocation>
        content_location: Option<String>,

        /// The size of the attachment's content in bytes.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/size>
        size: Option<usize>,

        /// The most recent modification time for the attachment.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/lastmodifiedtime>
        last_modified_time: Option<DateTime>,

        /// Whether the attachment appears inline in the item body.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/isinline>
        is_inline: Option<bool>,

        /// Whether the attachment represents a contact photo.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/iscontactphoto>
        is_contact_photo: Option<bool>,

        /// The base64-encoded content of the attachment.
        ///
        /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/content>
        content: Option<String>,
    },
}

/// An identifier for an attachment.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/attachmentid>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct AttachmentId {
    /// A unique identifier for the attachment.
    #[serde(rename = "@Id")]
    #[xml_struct(attribute)]
    pub id: String,

    /// The unique identifier of the item to which it is attached.
    #[serde(rename = "@RootItemId")]
    #[xml_struct(attribute)]
    pub root_item_id: Option<String>,

    /// The change key of the item to which it is attached.
    #[serde(rename = "@RootItemChangeKey")]
    #[xml_struct(attribute)]
    pub root_item_change_key: Option<String>,
}

/// The content of an item, represented according to MIME (Multipurpose Internet
/// Mail Extensions).
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mimecontent>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
pub struct MimeContent {
    /// The character set of the MIME content if it contains [RFC 2045]-encoded
    /// text.
    ///
    /// [RFC 2045]: https://datatracker.ietf.org/doc/html/rfc2045
    #[serde(rename = "@CharacterSet")]
    #[xml_struct(attribute)]
    pub character_set: Option<String>,

    /// The item content.
    #[serde(rename = "$text")]
    #[xml_struct(flatten)]
    pub content: String,
}

/// The headers of an Exchange item's MIME content.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/internetmessageheader>
#[derive(Clone, Debug, Deserialize, XmlSerialize)]
#[serde(rename_all = "PascalCase")]
pub struct InternetMessageHeader {
    /// The name of the header.
    #[serde(rename = "@HeaderName")]
    #[xml_struct(attribute)]
    pub header_name: String,

    /// The value of the header.
    #[serde(rename = "$text")]
    #[xml_struct(flatten)]
    pub value: String,
}

/// Structured data for diagnosing or responding to an EWS error.
///
/// Because the possible contents of this field are not documented, any XML
/// contained in the field is provided as text for debugging purposes. Known
/// fields which are relevant for programmatic error responses should be
/// provided as additional fields of this structure.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/messagexml>
#[derive(Clone, Debug, PartialEq)]
#[non_exhaustive]
pub struct MessageXml {
    /// A text representation of the contents of the field.
    pub content: String,

    /// The duration in milliseconds to wait before making additional requests
    /// if the server is throttling operations.
    pub back_off_milliseconds: Option<usize>,
}

#[cfg(test)]
mod tests {
    use quick_xml::Writer;

    use super::*;
    use crate::Error;

    /// Tests that an [`ArrayOfRecipients`] correctly serializes into XML. It
    /// should serialize as multiple `<t:Mailbox>` elements, one per [`Recipient`].
    #[test]
    fn serialize_array_of_recipients() -> Result<(), Error> {
        // Define the recipients to serialize.
        let alice = Recipient {
            mailbox: Mailbox {
                name: Some("Alice Test".into()),
                email_address: "alice@test.com".into(),
                routing_type: None,
                mailbox_type: None,
                item_id: None,
            },
        };

        let bob = Recipient {
            mailbox: Mailbox {
                name: Some("Bob Test".into()),
                email_address: "bob@test.com".into(),
                routing_type: None,
                mailbox_type: None,
                item_id: None,
            },
        };

        let recipients = ArrayOfRecipients(vec![alice, bob]);

        // Serialize into XML.
        let mut writer = {
            let inner: Vec<u8> = Default::default();
            Writer::new(inner)
        };
        recipients.serialize_as_element(&mut writer, "Recipients")?;

        // Read the contents of the `Writer`'s buffer.
        let buf = writer.into_inner();
        let actual = std::str::from_utf8(buf.as_slice())
            .map_err(|e| Error::UnexpectedResponse(e.to_string().into_bytes()))?;

        // Ensure the structure of the XML document is correct.
        let expected = "<Recipients><t:Mailbox><t:Name>Alice Test</t:Name><t:EmailAddress>alice@test.com</t:EmailAddress></t:Mailbox><t:Mailbox><t:Name>Bob Test</t:Name><t:EmailAddress>bob@test.com</t:EmailAddress></t:Mailbox></Recipients>";
        assert_eq!(expected, actual);

        Ok(())
    }

    /// Tests that deserializing a sequence of `<t:Mailbox>` XML elements
    /// results in an [`ArrayOfRecipients`] with one [`Recipient`] per
    /// `<t:Mailbox>` element.
    #[test]
    fn deserialize_array_of_recipients() -> Result<(), Error> {
        // The raw XML to deserialize.
        let xml = "<Recipients><t:Mailbox><t:Name>Alice Test</t:Name><t:EmailAddress>alice@test.com</t:EmailAddress></t:Mailbox><t:Mailbox><t:Name>Bob Test</t:Name><t:EmailAddress>bob@test.com</t:EmailAddress></t:Mailbox></Recipients>";

        // Deserialize the raw XML, with `serde_path_to_error` to help
        // troubleshoot any issue.
        let mut de = quick_xml::de::Deserializer::from_reader(xml.as_bytes());
        let recipients: ArrayOfRecipients = serde_path_to_error::deserialize(&mut de)?;

        // Ensure we have the right number of recipients in the resulting
        // `ArrayOfRecipients`.
        assert_eq!(recipients.0.len(), 2);

        // Ensure the first recipient correctly has a name and address.
        assert_eq!(
            recipients.first().expect("no recipient at index 0"),
            &Recipient {
                mailbox: Mailbox {
                    name: Some("Alice Test".into()),
                    email_address: "alice@test.com".into(),
                    routing_type: None,
                    mailbox_type: None,
                    item_id: None,
                },
            }
        );

        // Ensure the second recipient correctly has a name and address.
        assert_eq!(
            recipients.get(1).expect("no recipient at index 1"),
            &Recipient {
                mailbox: Mailbox {
                    name: Some("Bob Test".into()),
                    email_address: "bob@test.com".into(),
                    routing_type: None,
                    mailbox_type: None,
                    item_id: None,
                },
            }
        );

        Ok(())
    }
}
