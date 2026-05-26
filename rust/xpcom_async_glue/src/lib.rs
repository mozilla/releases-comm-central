/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module provides helpers to use Rust's asynchronous language features
//! when manipulating XPCOM asynchronous operations, such as network calls or
//! timers.

mod sleep;
pub use self::sleep::*;

mod async_channel_opener;
pub use async_channel_opener::*;
