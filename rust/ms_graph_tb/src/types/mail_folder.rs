/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Types related to MailFolder.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
use crate::Nullable;
use crate::odata::ExpandOptions;
use crate::types::entity::{Entity, EntitySelection};
use crate::types::message::{Message, MessageSelection};
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
pub enum MailFolderSelection {
    ChildFolderCount,
    DisplayName,
    Entity(EntitySelection),
    IsHidden,
    ParentFolderId,
    TotalItemCount,
    UnreadItemCount,
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
pub enum MailFolderExpand {
    ChildFolders(ExpandOptions<MailFolderSelection>),
    Messages(ExpandOptions<MessageSelection>),
    SingleValueExtendedProperties(ExpandOptions<SingleValueLegacyExtendedPropertySelection>),
}
impl fmt::Display for MailFolderExpand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MailFolderExpand::ChildFolders(opt) => opt.full_format(f, ExpandNames::from(self)),
            MailFolderExpand::Messages(opt) => opt.full_format(f, ExpandNames::from(self)),
            MailFolderExpand::SingleValueExtendedProperties(opt) => {
                opt.full_format(f, ExpandNames::from(self))
            }
        }
    }
}
#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct MailFolder {
    #[doc = "The number of immediate child mailFolders in the current mailFolder."]
    pub child_folder_count: Option<Nullable<i32>>,
    #[doc = "The collection of child folders in the mailFolder."]
    pub child_folders: Option<Vec<MailFolder>>,
    #[doc = "The mailFolder's display name."]
    pub display_name: Option<Nullable<String>>,
    #[doc = "Inherited properties from `Entity`."]
    #[serde(flatten)]
    pub entity: Entity,
    #[doc = "Indicates whether the mailFolder is hidden.\n\n This property can be set only when creating the folder. Find more information in Hidden mail folders."]
    pub is_hidden: Option<Nullable<bool>>,
    #[doc = "The collection of messages in the mailFolder."]
    pub messages: Option<Vec<Message>>,
    #[doc = "The unique identifier for the mailFolder's parent mailFolder."]
    pub parent_folder_id: Option<Nullable<String>>,
    #[doc = "The collection of single-value extended properties defined for the mailFolder.\n\n Read-only. Nullable."]
    pub single_value_extended_properties: Option<Vec<SingleValueLegacyExtendedProperty>>,
    #[doc = "The number of items in the mailFolder."]
    pub total_item_count: Option<Nullable<i32>>,
    #[doc = "The number of items in the mailFolder marked as unread."]
    pub unread_item_count: Option<Nullable<i32>>,
}
impl crate::extended_properties::SingleValueExtendedPropertiesExpand for MailFolderExpand {
    #[doc = r"Construct [`Self::SingleValueExtendedProperties`]."]
    fn svleps(options: ExpandOptions<SingleValueLegacyExtendedPropertySelection>) -> Self {
        Self::SingleValueExtendedProperties(options)
    }
}
impl crate::extended_properties::SingleValueExtendedPropertiesType for MailFolder {
    #[doc = r"Wrapper for [`Self::single_value_extended_properties`]."]
    fn all_svleps(&self) -> Option<&Vec<SingleValueLegacyExtendedProperty>> {
        self.single_value_extended_properties.as_ref()
    }
}
