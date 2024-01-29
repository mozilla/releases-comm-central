/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module provides idiomatic Rust data structure for building and sending
//! HTTP requests through Necko, the networking component of Firefox and
//! Thunderbird.
//!
//!
//! ## Sending requests
//!
//! A simple request can be built and sent using the helper methods on
//! [`Client`]:
//!
//! ```rust
//! # async fn run() -> crate::Result<()> {
//! let client = Client::new();
//!
//! let url = Url::parse("https://example.com")?;
//! let response = client.get(&url)
//!     .send()
//!     .await?;
//! # Ok(())
//! # }
//! ```
//!
//! Setting a request's body is done this way:
//!
//! ```rust
//! use url::Url;
//!
//! # async fn run() -> crate::Result<()> {
//! let client = Client::new();
//!
//! let url = Url::parse("https://example.com")?;
//! let response = client.post(&url)
//!     .body(
//!         "{\"foo\": \"bar\"}",
//!         "application/json",
//!     )
//!     .send()
//!     .await?;
//! # Ok(())
//! # }
//! ```

mod client;
mod error;
mod request;
mod response;

pub use client::{Client, Method};
pub use error::{Error, Result};
pub use request::RequestBuilder;
pub use response::{Response, StatusCode};
