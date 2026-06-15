/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
#[derive(Copy, Clone, Debug, Display, EnumString, Serialize, Deserialize, PartialEq, Eq)]
#[strum(serialize_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum FollowupFlagStatus {
    NotFlagged,
    Complete,
    Flagged,
}
