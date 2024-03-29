/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: This crate will be replaced once additional operations are needed and
// (hopefully) we have a slightly better picture of our error handling needs.
// Primary bodies of work include a more flexible design for calling operations
// and developing a good API around returning errors to consumers, both errors
// affecting the entire request and those which only apply to single elements of
// the operation.

mod client;
mod operations;
pub mod types;

pub use client::*;
pub use operations::*;
