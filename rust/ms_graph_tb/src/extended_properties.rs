/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Hand-written types and wrappers for simpler, more strongly-typed access to
//! [extended properties].
//!
//! There are two kinds of extended properties: single-value legacy extended
//! properties, and multi-value legacy extended properties, where the word
//! "legacy" is often elided. This crate currently only supports single-value
//! legacy extended properties, or SVLEPs for short.
//!
//! The typical way to use this module is to define a constant representing the
//! property in question via [`crate::define_svlep!`], calling
//! [`SingleValueExtendedPropertiesOp::expand_typed_svlep`] with that constant,
//! and getting the result from the response via
//! [`SingleValueExtendedPropertiesType::typed_svlep`] with the same constant.
//!
//! # Example
//!
//! ```rust
//! # use ms_graph_tb::define_svlep;
//! # use ms_graph_tb::extended_properties::{
//! #     SingleValueExtendedPropertiesOp, SingleValueExtendedPropertiesType,
//! # };
//! # use ms_graph_tb::paths::me::mail_folders::mail_folder_id::messages;
//! # let endpoint = String::new();
//! # let folder_id = String::new();
//! define_svlep!(PID_TAG_MESSAGE_SIZE, Integer, 0x0E08);
//!
//! let mut request = messages::Get::new(endpoint, folder_id);
//! request.expand_typed_svlep([PID_TAG_MESSAGE_SIZE]);
//!
//! // let message = [send request and get response];
//! # let message = ms_graph_tb::types::message::Message::new()
//! #     .set_single_value_extended_properties(vec![
//! #         ms_graph_tb::types::single_value_legacy_extended_property::SingleValueLegacyExtendedProperty::new()
//! #             .set_entity(ms_graph_tb::types::entity::Entity::new().set_id("Integer 0x0E08".to_string()))
//! #             .set_value(Some("42".to_string())),
//! #     ]);
//! let message_size = message.typed_svlep(PID_TAG_MESSAGE_SIZE)?;
//! assert_eq!(message_size, Some(42));
//! # Ok::<(), ms_graph_tb::Error>(())
//! ```
//!
//! [extended properties]: https://learn.microsoft.com/en-us/graph/api/resources/extended-properties-overview

use crate::types::single_value_legacy_extended_property::{
    SingleValueLegacyExtendedProperty, SingleValueLegacyExtendedPropertySelection,
};
use crate::{
    Error, Expand, filter_ident,
    odata::{ExpandOptions, FilterExpression},
};
use std::fmt::{Display, Formatter};
use std::marker::PhantomData;
use strum::{Display as StrumDisplay, EnumString};

/// MAPI property types accepted by Graph extended property identifiers.
///
/// These do not appear to be documented anywhere for Graph, but are assumed to
/// be the same as those given in the [.NET EWS API documentation]. The name
/// created via [`Display`] and the integer obtained via [`as`] are
/// interchangeable in the underlying requests.
///
/// [.NET EWS API documentation]: https://learn.microsoft.com/en-us/dotnet/api/exchangewebservices.mapipropertytypetype?view=exchange-ews-proxy
/// [`as`]: https://doc.rust-lang.org/std/keyword.as.html
// Do NOT remove or reorder items, it's part of the API. See above.
#[derive(Copy, Clone, Debug, EnumString, StrumDisplay, PartialEq, Eq, Hash)]
#[strum(serialize_all = "PascalCase")]
pub enum MapiPropertyType {
    /// 64-bit float where the integer portion is the date and the fractional
    /// portion is the time.
    ApplicationTime,
    /// Array of [`Self::ApplicationTime`].
    ApplicationTimeArray,
    /// Base64-encoded binary.
    Binary,
    /// Array of [`Self::Binary`].
    BinaryArray,
    /// True or false.
    Boolean,
    /// GUID string.
    #[strum(serialize = "CLSID")]
    Clsid,
    /// Array of [`Self::Clsid`].
    #[strum(serialize = "CLSIDArray")]
    ClsidArray,
    /// 64-bit integer representing a number of cents.
    Currency,
    /// Array of [`Self::Currency`].
    CurrencyArray,
    /// Identifies a 64-bit floating-point value.
    Double,
    /// Array of [`Self::Double`].
    DoubleArray,
    /// 32-bit unsigned integer representing an [SCODE] value.
    ///
    /// [SCODE]: https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/scode
    Error,
    /// 32-bit float.
    Float,
    /// Array of [`Self::Float`].
    FloatArray,
    /// 32-bit integer.
    Integer,
    /// Array of [`Self::Integer`].
    IntegerArray,
    /// 64-bit integer ("signed or unsigned").
    Long,
    /// Array of [`Self::Long`].
    LongArray,
    /// No value.
    Null,
    /// A pointer to an object (not supported in Graph).
    Object,
    /// Array of [`Self::Object`] (not supported in Graph).
    ObjectArray,
    /// 16-bit signed integer.
    Short,
    /// Array of [`Self::Short`].
    ShortArray,
    /// 64-bit [`FILETIME`] object.
    ///
    ///[`FILETIME`]: https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-filetime
    SystemTime,
    /// Array of [`Self::SystemTime`].
    SystemTimeArray,
    /// Unicode string.
    String,
    /// Array of [`Self::String`].
    StringArray,
}

/// Identifier for a Graph extended property.
///
/// Currently only supports proptag ids. See the [Microsoft documentation] for
/// more details.
///
/// [Microsoft documentation]: https://learn.microsoft.com/en-us/graph/api/resources/extended-properties-overview?view=graph-rest-1.0#id-formats
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct ExtendedPropertyId {
    property_type: MapiPropertyType,
    property_tag: u16,
}

impl ExtendedPropertyId {
    /// Constructor given the fields of of a proptag.
    #[must_use]
    pub const fn proptag(property_type: MapiPropertyType, property_tag: u16) -> Self {
        Self {
            property_type,
            property_tag,
        }
    }

    /// Parse a string as a a proptag (assumes a hex value).
    fn parse_graph_proptag(value: &str) -> Option<Self> {
        let (property_type, property_tag) = value.split_once(' ')?;
        let property_type = property_type.parse().ok()?;
        let property_tag = property_tag
            .strip_prefix("0x")
            .or_else(|| property_tag.strip_prefix("0X"))?;
        let property_tag = u16::from_str_radix(property_tag, 16).ok()?;
        Some(Self::proptag(property_type, property_tag))
    }
}

impl Display for ExtendedPropertyId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        // Currently uses the string property types; we could save a few bytes
        // using the numeric representation instead, at the expense of
        // readability when debugging. The property tag part has to be numeric,
        // practically speaking (there might be names, but it requires a
        // GUID for the namespace to use them, and I couldn't find the right
        // one for size).
        write!(f, "{} 0x{:04X}", self.property_type, self.property_tag)
    }
}

/// Indicates the Rust type can be used to represent a specific MAPI extended
/// property type.
pub trait ExtendedPropertyValue: Sized {
    const MAPI_PROPERTY_TYPE: MapiPropertyType;

    /// Converts a string representation of the MAPI value into `Self`.
    fn parse_extended_property(value: &str) -> Result<Self, Error>;
}

/// Type information for a request for a [`SingleValueLegacyExtendedProperty`].
///
/// See also the Microsoft documentation for [creating] and [getting]
/// single-value extended properties.
///
/// [`SingleValueLegacyExtendedProperty`]: crate::types::single_value_legacy_extended_property::SingleValueLegacyExtendedProperty
/// [creating]: https://learn.microsoft.com/en-us/graph/api/singlevaluelegacyextendedproperty-post-singlevalueextendedproperties?view=graph-rest-1.0&tabs=http
/// [getting]: https://learn.microsoft.com/en-us/graph/api/singlevaluelegacyextendedproperty-get?view=graph-rest-1.0&tabs=http
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct SingleValueExtendedPropertyDefinition<T: ExtendedPropertyValue> {
    id: ExtendedPropertyId,
    _value: PhantomData<fn() -> T>,
}

impl<T: ExtendedPropertyValue> SingleValueExtendedPropertyDefinition<T> {
    /// Constructor from the [property tag] (and, implicitly, the
    /// [`ExtendedPropertyValue::MAPI_PROPERTY_TYPE`] from `T`).
    ///
    /// The full list of supported property tags can be found in Microsoft's
    /// [\[MS-OXPROPS\] document].
    ///
    /// [property tag]: https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/mapi-property-tags
    /// [\[MS-OXPROPS\] document]: https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxprops/
    #[must_use]
    pub const fn proptag(property_tag: u16) -> Self {
        Self {
            id: ExtendedPropertyId::proptag(T::MAPI_PROPERTY_TYPE, property_tag),
            _value: PhantomData,
        }
    }

    /// Get the `ExtendedPropertyId` associated with this property.
    #[must_use]
    pub fn id(&self) -> &ExtendedPropertyId {
        &self.id
    }

    fn parse_value(&self, value: &str) -> Result<T, Error> {
        T::parse_extended_property(value)
    }
}

impl ExtendedPropertyValue for bool {
    const MAPI_PROPERTY_TYPE: MapiPropertyType = MapiPropertyType::Boolean;

    fn parse_extended_property(value: &str) -> Result<Self, Error> {
        value.parse().map_err(|err| {
            Error::UnexpectedResponse(format!("invalid bool extended property: {err}"))
        })
    }
}

impl ExtendedPropertyValue for i16 {
    const MAPI_PROPERTY_TYPE: MapiPropertyType = MapiPropertyType::Short;

    fn parse_extended_property(value: &str) -> Result<Self, Error> {
        value.parse().map_err(|err| {
            Error::UnexpectedResponse(format!("invalid i16 extended property: {err}"))
        })
    }
}

impl ExtendedPropertyValue for i32 {
    const MAPI_PROPERTY_TYPE: MapiPropertyType = MapiPropertyType::Integer;

    fn parse_extended_property(value: &str) -> Result<Self, Error> {
        value.parse().map_err(|err| {
            Error::UnexpectedResponse(format!("invalid i32 extended property: {err}"))
        })
    }
}

impl ExtendedPropertyValue for f32 {
    const MAPI_PROPERTY_TYPE: MapiPropertyType = MapiPropertyType::Float;

    fn parse_extended_property(value: &str) -> Result<Self, Error> {
        value.parse().map_err(|err| {
            Error::UnexpectedResponse(format!("invalid f32 extended property: {err}"))
        })
    }
}

impl ExtendedPropertyValue for f64 {
    const MAPI_PROPERTY_TYPE: MapiPropertyType = MapiPropertyType::Double;

    fn parse_extended_property(value: &str) -> Result<Self, Error> {
        value.parse().map_err(|err| {
            Error::UnexpectedResponse(format!("invalid f64 extended property: {err}"))
        })
    }
}

impl ExtendedPropertyValue for String {
    const MAPI_PROPERTY_TYPE: MapiPropertyType = MapiPropertyType::String;

    fn parse_extended_property(value: &str) -> Result<Self, Error> {
        Ok(value.to_string())
    }
}

/// Build the standard expansion used to request specific single-value extended
/// properties.
#[must_use]
pub fn svlep_expand<I>(
    property_ids: I,
) -> Option<ExpandOptions<SingleValueLegacyExtendedPropertySelection>>
where
    I: IntoIterator<Item = ExtendedPropertyId>,
{
    let mut property_ids = property_ids.into_iter();
    let first = property_ids.next()?;

    let mut options = ExpandOptions::new();

    let expression = property_ids.fold(
        FilterExpression::eq(filter_ident!("id"), first.to_string()),
        |expression, property_id| {
            FilterExpression::or(
                expression,
                FilterExpression::eq(filter_ident!("id"), property_id.to_string()),
            )
        },
    );
    options.filter(expression);
    Some(options)
}

/// For expand enums with a `SingleValueExtendedProperties` variant.
pub trait SingleValueExtendedPropertiesExpand: Sized {
    /// Constructs the `SingleValueExtendedProperties` variant with the given
    /// options.
    fn svleps(options: ExpandOptions<SingleValueLegacyExtendedPropertySelection>) -> Self;
}

/// Indicates the [`Operation`](crate::Operation) supports expanding [single
/// value extended properties].
///
/// [single value extended properties]: https://learn.microsoft.com/en-us/graph/api/resources/extended-properties-overview
pub trait SingleValueExtendedPropertiesOp: Expand
where
    Self::Properties: SingleValueExtendedPropertiesExpand,
{
    /// Add the given single-value legacy extended property identifiers to the
    /// request expansion.
    fn expand_svlep<I>(&mut self, property_ids: I)
    where
        I: IntoIterator<Item = ExtendedPropertyId>,
    {
        if let Some(options) = svlep_expand(property_ids) {
            self.extend_expand([Self::Properties::svleps(options)]);
        }
    }

    /// Add the given typed single-value legacy extended property definitions
    /// to the request expansion.
    fn expand_typed_svlep<T, I>(&mut self, definitions: I)
    where
        T: ExtendedPropertyValue,
        I: IntoIterator<Item = SingleValueExtendedPropertyDefinition<T>>,
    {
        self.expand_svlep(definitions.into_iter().map(|def| *def.id()));
    }
}

impl<T> SingleValueExtendedPropertiesOp for T
where
    T: Expand,
    T::Properties: SingleValueExtendedPropertiesExpand,
{
}

impl SingleValueLegacyExtendedProperty<'_> {
    /// Returns whether the given ID matches the one in this object.
    ///
    /// Returns an error if this object is malformed.
    pub fn matches_id(&self, id: &ExtendedPropertyId) -> Result<bool, Error> {
        Ok(ExtendedPropertyId::parse_graph_proptag(self.entity().id()?)
            .is_some_and(|returned_id| returned_id == *id))
    }
}

/// Trait for types that support single-value legacy extended properties.
///
/// [single-value legacy extended properties]: https://learn.microsoft.com/en-us/graph/api/resources/singlevaluelegacyextendedproperty?view=graph-rest-1.0
pub trait SingleValueExtendedPropertiesType<'a> {
    /// Get all single-value legacy extended properties.
    ///
    /// Typically just a wrapper for the type's
    /// `single_value_extended_properties` method.
    fn all_svleps(&'a self) -> Result<Vec<SingleValueLegacyExtendedProperty<'a>>, Error>;

    /// Get the single-value legacy extended property with the given ID.
    fn svlep(
        &'a self,
        id: ExtendedPropertyId,
    ) -> Result<Option<SingleValueLegacyExtendedProperty<'a>>, Error> {
        let properties = self.all_svleps()?;

        for property in properties {
            if property.matches_id(&id)? {
                return Ok(Some(property));
            }
        }

        Ok(None)
    }

    /// Get the single-value legacy extended property with the given definition.
    fn typed_svlep<T>(
        &'a self,
        definition: SingleValueExtendedPropertyDefinition<T>,
    ) -> Result<Option<T>, Error>
    where
        T: ExtendedPropertyValue,
    {
        let Some(property) = self.svlep(*definition.id())? else {
            return Ok(None);
        };

        let Some(value) = property.value()? else {
            return Ok(None);
        };

        definition.parse_value(value).map(Some)
    }
}

/// Define a constant [`SingleValueExtendedPropertyDefinition`] with the given
/// name, [MAPI property type], and [proptag].
///
/// [MAPI property type]: MapiPropertyType
/// [proptag]: https://learn.microsoft.com/en-us/graph/api/resources/extended-properties-overview?view=graph-rest-1.0#id-formats
#[macro_export]
macro_rules! define_svlep {
    ($name:ident, Boolean, $property_tag:expr $(,)?) => {
        const $name: $crate::extended_properties::SingleValueExtendedPropertyDefinition<bool> =
            $crate::extended_properties::SingleValueExtendedPropertyDefinition::<bool>::proptag(
                $property_tag,
            );
    };
    ($name:ident, Short, $property_tag:expr $(,)?) => {
        const $name: $crate::extended_properties::SingleValueExtendedPropertyDefinition<i16> =
            $crate::extended_properties::SingleValueExtendedPropertyDefinition::<i16>::proptag(
                $property_tag,
            );
    };
    ($name:ident, Integer, $property_tag:expr $(,)?) => {
        const $name: $crate::extended_properties::SingleValueExtendedPropertyDefinition<i32> =
            $crate::extended_properties::SingleValueExtendedPropertyDefinition::<i32>::proptag(
                $property_tag,
            );
    };
    ($name:ident, Float, $property_tag:expr $(,)?) => {
        const $name: $crate::extended_properties::SingleValueExtendedPropertyDefinition<f32> =
            $crate::extended_properties::SingleValueExtendedPropertyDefinition::<f32>::proptag(
                $property_tag,
            );
    };
    ($name:ident, Double, $property_tag:expr $(,)?) => {
        const $name: $crate::extended_properties::SingleValueExtendedPropertyDefinition<f64> =
            $crate::extended_properties::SingleValueExtendedPropertyDefinition::<f64>::proptag(
                $property_tag,
            );
    };
    ($name:ident, String, $property_tag:expr $(,)?) => {
        const $name: $crate::extended_properties::SingleValueExtendedPropertyDefinition<String> =
            $crate::extended_properties::SingleValueExtendedPropertyDefinition::<String>::proptag(
                $property_tag,
            );
    };
    ($name:ident, $kind:ident, $property_tag:expr $(,)?) => {
        compile_error!(concat!(
            "define_svlep! does not yet support MAPI property type ",
            stringify!($kind)
        ))
    };
}

#[cfg(test)]
mod tests {
    use super::{
        ExtendedPropertyId, MapiPropertyType, SingleValueExtendedPropertiesOp,
        SingleValueExtendedPropertiesType, svlep_expand,
    };
    use crate::types::message::Message;
    use crate::{Error, Operation, paths};
    use http::Uri;

    crate::define_svlep!(PID_TAG_MESSAGE_SIZE, Integer, 0x0E08);

    #[test]
    fn mapi_property_type_casting() {
        assert_eq!(MapiPropertyType::ApplicationTime as u8, 0);
        assert_eq!(MapiPropertyType::StringArray as u8, 26);
        assert_eq!(MapiPropertyType::Integer as u8, 14);
    }

    #[test]
    fn serialize_single_value_extended_property_id() {
        let property_id = ExtendedPropertyId::proptag(MapiPropertyType::Integer, 0x0E08);
        assert_eq!(property_id.to_string(), "Integer 0x0E08");
    }

    #[test]
    fn proptag_id_match() -> Result<(), Error> {
        let property =
            crate::types::single_value_legacy_extended_property::SingleValueLegacyExtendedProperty::new(
            )
            .set_entity(crate::types::entity::Entity::new().set_id("Integer 0xe08".to_string()))
            .set_value(Some("42".to_string()));

        assert!(property.matches_id(PID_TAG_MESSAGE_SIZE.id())?);

        Ok(())
    }

    #[test]
    fn serialize_single_value_extended_properties_expand() {
        let options =
            svlep_expand([*PID_TAG_MESSAGE_SIZE.id()]).expect("property ids should not be empty");
        assert_eq!(options.to_string(), "$filter=id eq 'Integer 0x0E08'");
    }

    #[test]
    fn serialize_message_request_with_extended_properties() -> Result<(), Error> {
        let mut request = paths::me::mail_folders::mail_folder_id::messages::Get::new(
            "https://graph.microsoft.com/v1.0".to_string(),
            "inbox".to_string(),
        );
        request.expand_typed_svlep([PID_TAG_MESSAGE_SIZE]);
        let req = request.build_request()?;

        // <https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?expand=singleValueExtendedProperties($filter=id eq 'Integer 0x0E08')>
        let expected = Uri::try_from(
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?expand=singleValueExtendedProperties%28%24filter%3Did+eq+%27Integer+0x0E08%27%29",
        )
        .unwrap();
        assert_eq!(*req.uri(), expected);

        Ok(())
    }

    #[test]
    fn get_typed_single_value_extended_property() -> Result<(), Error> {
        let message = Message::new().set_single_value_extended_properties(vec![
            crate::types::single_value_legacy_extended_property::SingleValueLegacyExtendedProperty::new()
                .set_entity(crate::types::entity::Entity::new().set_id("Integer 0x0E08".to_string()))
                .set_value(Some("42".to_string())),
        ]);

        assert_eq!(message.typed_svlep(PID_TAG_MESSAGE_SIZE)?, Some(42));

        Ok(())
    }

    #[test]
    fn typed_single_value_extended_property_reports_invalid_values() {
        let definition = PID_TAG_MESSAGE_SIZE;
        let err = definition.parse_value("NaN").unwrap_err();
        assert!(matches!(err, Error::UnexpectedResponse(_)));
    }
}
