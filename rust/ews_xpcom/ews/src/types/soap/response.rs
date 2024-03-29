/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;

use crate::OperationResponse;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Envelope {
    pub body: Body,
}

#[derive(Debug, Deserialize)]
pub struct Body {
    #[serde(rename = "$value")]
    pub response: OperationResponse,
}
