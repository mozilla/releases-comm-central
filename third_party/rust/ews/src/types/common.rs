/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

pub(crate) const MESSAGES_NS_URI: &str =
    "http://schemas.microsoft.com/exchange/services/2006/messages";
pub(crate) const SOAP_NS_URI: &str = "http://schemas.xmlsoap.org/soap/envelope/";
pub(crate) const TYPES_NS_URI: &str = "http://schemas.microsoft.com/exchange/services/2006/types";

/// The folder properties which should be included in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/foldershape>.
#[derive(Debug, Default, XmlSerialize)]
pub struct FolderShape {
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,
}

/// The item properties which should be included in the response.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemshape>.
#[derive(Debug, Default, XmlSerialize)]
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
#[derive(Debug, XmlSerialize)]
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

/// A well-known MAPI property set identifier.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedfielduri#distinguishedpropertysetid-attribute>
#[derive(Clone, Copy, Debug, XmlSerialize)]
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

/// The type of the value of a MAPI property.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/extendedfielduri#propertytype-attribute>
#[derive(Clone, Copy, Debug, XmlSerialize)]
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
#[derive(Debug, Deserialize, PartialEq)]
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
#[derive(Debug, XmlSerialize)]
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
#[derive(Debug, Deserialize, PartialEq)]
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
#[derive(Debug, XmlSerialize)]
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
#[derive(Debug, Deserialize, XmlSerialize)]
pub struct ItemId {
    #[xml_struct(attribute)]
    #[serde(rename = "@Id")]
    pub id: String,

    #[serde(rename = "@ChangeKey")]
    #[xml_struct(attribute)]
    pub change_key: Option<String>,
}

/// The representation of a folder in an EWS operation.
#[derive(Debug, Deserialize)]
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

/// An item which may appear as the result of a request to read or modify an
/// Exchange item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/items>
#[derive(Debug, Deserialize)]
pub enum RealItem {
    Message(Message),
}

/// An item which may appear in an item-based attachment.
///
/// See [`Attachment::ItemAttachment`] for details.
// N.B.: Commented-out variants are not yet implemented.
#[derive(Debug, Deserialize)]
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
#[derive(Debug, Deserialize)]
pub struct DateTime(#[serde(with = "time::serde::iso8601")] pub time::OffsetDateTime);

/// An email message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/message-ex15websvcsotherref>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Message {
    /// The MIME content of the item.
    pub mime_content: Option<MimeContent>,

    /// The item's Exchange identifier.
    pub item_id: ItemId,

    /// The identifier for the containing folder.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/parentfolderid>
    pub parent_folder_id: Option<FolderId>,

    /// The Exchange class value of the item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemclass>
    pub item_class: Option<String>,

    /// The subject of the item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/subject>
    pub subject: Option<String>,

    pub sensitivity: Option<Sensitivity>,
    pub body: Option<Body>,
    pub attachments: Option<Attachments>,
    pub date_time_received: Option<DateTime>,
    pub size: Option<usize>,

    /// A list of categories describing an item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/categories-ex15websvcsotherref>
    pub categories: Option<Vec<StringElement>>,

    pub importance: Option<Importance>,
    pub in_reply_to: Option<String>,
    pub is_submitted: Option<bool>,
    pub is_draft: Option<bool>,
    pub is_from_me: Option<bool>,
    pub is_resend: Option<bool>,
    pub is_unmodified: Option<bool>,
    pub internet_message_headers: Option<InternetMessageHeaders>,
    pub date_time_sent: Option<DateTime>,
    pub date_time_created: Option<DateTime>,
    pub reminder_due_by: Option<DateTime>,
    pub reminder_is_set: Option<bool>,
    pub reminder_minutes_before_start: Option<usize>,
    pub display_cc: Option<String>,
    pub display_to: Option<String>,
    pub has_attachments: Option<bool>,
    pub culture: Option<String>,
    pub sender: Option<SingleRecipient>,
    pub to_recipients: Option<ArrayOfRecipients>,
    pub cc_recipients: Option<ArrayOfRecipients>,
    pub bcc_recipients: Option<ArrayOfRecipients>,
    pub is_read_receipt_requested: Option<bool>,
    pub is_delivery_receipt_requested: Option<bool>,
    pub conversation_index: Option<String>,
    pub conversation_topic: Option<String>,
    pub from: Option<SingleRecipient>,
    pub internet_message_id: Option<String>,
    pub is_read: Option<bool>,
    pub is_response_requested: Option<bool>,
    pub reply_to: Option<SingleRecipient>,
    pub received_by: Option<SingleRecipient>,
    pub received_representing: Option<SingleRecipient>,
    pub last_modified_name: Option<String>,
    pub last_modified_time: Option<DateTime>,
    pub is_associated: Option<bool>,
    pub conversation_id: Option<ItemId>,
}

/// A list of attachments.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/attachments-ex15websvcsotherref>
#[derive(Debug, Deserialize)]
pub struct Attachments {
    #[serde(rename = "$value")]
    pub inner: Vec<Attachment>,
}

/// A single mailbox.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SingleRecipient {
    pub mailbox: Mailbox,
}

/// A list of mailboxes.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ArrayOfRecipients {
    pub mailbox: Vec<Mailbox>,
}

/// A list of Internet Message Format headers.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct InternetMessageHeaders {
    pub internet_message_header: Vec<InternetMessageHeader>,
}

/// A reference to a user or address which can send or receive mail.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mailbox>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Mailbox {
    /// The name of this mailbox's user.
    pub name: Option<String>,

    /// The email address for this mailbox.
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
#[derive(Clone, Copy, Debug, Default, Deserialize)]
pub enum RoutingType {
    #[default]
    SMTP,
    EX,
}

/// The type of sender or recipient a mailbox represents.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mailboxtype>
#[derive(Clone, Copy, Debug, Deserialize)]
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
#[derive(Clone, Copy, Debug, Deserialize)]
pub enum Importance {
    Low,
    Normal,
    High,
}

/// A string value.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/string>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct StringElement {
    /// The string content.
    pub string: String,
}

/// The sensitivity of the contents of an item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/sensitivity>
#[derive(Clone, Copy, Debug, Deserialize)]
pub enum Sensitivity {
    Normal,
    Personal,
    Private,
    Confidential,
}

/// The body of an item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/body>
#[derive(Debug, Deserialize)]
pub struct Body {
    /// The content type of the body.
    #[serde(rename = "@BodyType")]
    pub body_type: BodyType,

    /// Whether the body has been truncated.
    #[serde(rename = "@IsTruncated")]
    pub is_truncated: Option<bool>,

    /// The content of the body.
    // TODO: It's not immediately obvious why this tag may be empty, but it has
    // been encountered in real world responses. Needs a closer look.
    #[serde(rename = "$text")]
    pub content: Option<String>,
}

/// The content type of an item's body.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/body>
#[derive(Clone, Copy, Debug, Deserialize)]
pub enum BodyType {
    HTML,
    Text,
}

/// An attachment to an Exchange item.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/attachments-ex15websvcsotherref>
#[derive(Debug, Deserialize)]
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
#[derive(Debug, Deserialize)]
pub struct AttachmentId {
    /// A unique identifier for the attachment.
    #[serde(rename = "@Id")]
    pub id: String,

    /// The unique identifier of the item to which it is attached.
    #[serde(rename = "@RootItemId")]
    pub root_item_id: Option<String>,

    /// The change key of the item to which it is attached.
    #[serde(rename = "@RootItemChangeKey")]
    pub root_item_change_key: Option<String>,
}

/// The content of an item, represented according to MIME (Multipurpose Internet
/// Mail Extensions).
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/mimecontent>
#[derive(Debug, Deserialize)]
pub struct MimeContent {
    /// The character set of the MIME content if it contains [RFC 2045]-encoded
    /// text.
    ///
    /// [RFC 2045]: https://datatracker.ietf.org/doc/html/rfc2045
    #[serde(rename = "@CharacterSet")]
    pub character_set: Option<String>,

    /// The item content.
    #[serde(rename = "$text")]
    pub content: String,
}

/// The headers of an Exchange item's MIME content.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/internetmessageheader>
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct InternetMessageHeader {
    /// The name of the header.
    #[serde(rename = "@HeaderName")]
    pub header_name: String,

    /// The value of the header.
    #[serde(rename = "$text")]
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
#[derive(Debug, PartialEq)]
#[non_exhaustive]
pub struct MessageXml {
    /// A text representation of the contents of the field.
    pub content: String,

    /// The duration in milliseconds to wait before making additional requests
    /// if the server is throttling operations.
    pub back_off_milliseconds: Option<usize>,
}
