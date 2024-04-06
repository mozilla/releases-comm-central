/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod common;
mod operations;

pub use common::*;
pub use operations::*;
pub mod soap;

pub mod get_folder;
pub mod sync_folder_hierarchy;
