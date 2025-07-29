/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews_proc_macros::operation_response;
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{BaseItemId, ItemShape, Items, MESSAGES_NS_URI};

/// A request for the properties of one or more Exchange items, e.g. messages,
/// calendar events, or contacts.
///
/// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/getitem>
#[derive(Clone, Debug, XmlSerialize)]
#[xml_struct(default_ns = MESSAGES_NS_URI)]
#[operation_response(GetItemResponseMessage)]
pub struct GetItem {
    /// A description of the information to be included in the response for each
    /// item.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemshape>
    pub item_shape: ItemShape,

    /// The Exchange identifiers of the items which should be fetched.
    ///
    /// See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/itemids>
    pub item_ids: Vec<BaseItemId>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub struct GetItemResponseMessage {
    pub items: Items,
}
