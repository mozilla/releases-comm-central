/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to Calendar.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use crate::odata::ExpandOptions;
use crate::types::email_address::EmailAddress;
use crate::types::entity::{Entity, EntitySelection};
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
pub enum CalendarSelection {
    CanEdit,
    CanShare,
    CanViewPrivateItems,
    ChangeKey,
    Entity(EntitySelection),
    HexColor,
    IsDefaultCalendar,
    IsRemovable,
    IsTallyingResponses,
    Name,
    Owner,
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
pub enum CalendarExpand {
    SingleValueExtendedProperties(ExpandOptions<SingleValueLegacyExtendedPropertySelection>),
}
impl fmt::Display for CalendarExpand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CalendarExpand::SingleValueExtendedProperties(opt) => {
                opt.full_format(f, ExpandNames::from(self))
            }
        }
    }
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct Calendar {
    #[doc = "true if the user can write to the calendar, false otherwise.\n\n This property is true for the user who created the calendar. This property is also true for a user who shared a calendar and granted write access."]
    pub can_edit: Option<Nullable<bool>>,
    #[doc = "true if the user has permission to share the calendar, false otherwise.\n\n Only the user who created the calendar can share it."]
    pub can_share: Option<Nullable<bool>>,
    #[doc = "If true, the user can read calendar items that have been marked private, false otherwise."]
    pub can_view_private_items: Option<Nullable<bool>>,
    #[doc = "Identifies the version of the calendar object.\n\n Every time the calendar is changed, changeKey changes as well. This allows Exchange to apply changes to the correct version of the object. Read-only."]
    pub change_key: Option<Nullable<String>>,
    #[doc = "Inherited properties from `Entity`."]
    #[serde(flatten)]
    pub entity: Entity,
    #[doc = "The calendar color, expressed in a hex color code of three hexadecimal values, each ranging from 00 to FF and representing the red, green, or blue components of the color in the RGB color space.\n\n If the user has never explicitly set a color for the calendar, this property is empty. Read-only."]
    pub hex_color: Option<Nullable<String>>,
    #[doc = "true if this is the default calendar where new events are created by default, false otherwise."]
    pub is_default_calendar: Option<Nullable<bool>>,
    #[doc = "Indicates whether this user calendar can be deleted from the user mailbox."]
    pub is_removable: Option<Nullable<bool>>,
    #[doc = "Indicates whether this user calendar supports tracking of meeting responses.\n\n Only meeting invites sent from users' primary calendars support tracking of meeting responses."]
    pub is_tallying_responses: Option<Nullable<bool>>,
    #[doc = "The calendar name."]
    pub name: Option<Nullable<String>>,
    #[doc = "If set, this represents the user who created or added the calendar.\n\n For a calendar that the user created or added, the owner property is set to the user. For a calendar shared with the user, the owner property is set to the person who shared that calendar with the user."]
    pub owner: Option<EmailAddress>,
    #[doc = "The collection of single-value extended properties defined for the calendar.\n\n Read-only. Nullable."]
    pub single_value_extended_properties: Option<Vec<SingleValueLegacyExtendedProperty>>,
}
impl crate::extended_properties::SingleValueExtendedPropertiesExpand for CalendarExpand {
    #[doc = r"Construct [`Self::SingleValueExtendedProperties`]."]
    fn svleps(options: ExpandOptions<SingleValueLegacyExtendedPropertySelection>) -> Self {
        Self::SingleValueExtendedProperties(options)
    }
}
impl crate::extended_properties::SingleValueExtendedPropertiesType for Calendar {
    #[doc = r"Wrapper for [`Self::single_value_extended_properties`]."]
    fn all_svleps(&self) -> Option<&Vec<SingleValueLegacyExtendedProperty>> {
        self.single_value_extended_properties.as_ref()
    }
}
