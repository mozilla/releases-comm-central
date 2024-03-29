/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use super::BaseShape;

#[derive(Debug, XmlSerialize)]
pub struct ItemShape {
    #[xml_struct(ns_prefix = "t")]
    pub base_shape: BaseShape,
}

#[derive(Clone, Copy, Debug, XmlSerialize)]
#[xml_struct(text)]
pub enum Traversal {
    Shallow,
    SoftDeleted,
    Associated,
}

#[derive(Debug, Deserialize)]
pub struct Items {
    #[serde(default, rename = "$value")]
    pub items: Vec<Item>,
}

#[derive(Debug, Deserialize)]
pub enum Item {
    Message(Message),
}

/// An email message.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/message-ex15websvcsotherref>.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Message {
    pub item_id: ItemId,
    pub subject: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ItemId {
    pub id: String,
    pub change_key: String,
}
