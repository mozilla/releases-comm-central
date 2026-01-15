/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod common;
mod operations;

pub use common::*;
pub use operations::*;
pub mod soap;

pub mod copy_folder;
pub mod copy_item;
pub mod create_folder;
pub mod create_item;
pub mod delete_folder;
pub mod delete_item;
pub mod empty_folder;
pub mod find_item;
pub mod get_folder;
pub mod get_item;
pub mod mark_all_read;
pub mod mark_as_junk;
pub mod move_folder;
pub mod move_item;
pub mod server_version;
pub mod sync_folder_hierarchy;
pub mod sync_folder_items;
pub mod update_folder;
pub mod update_item;
