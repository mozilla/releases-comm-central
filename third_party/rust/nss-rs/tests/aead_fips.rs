// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! Tests for the blapi backend running under a FIPS-mode NSS database.
//!
//! The blapi feature calls freebl directly, bypassing softoken's FIPS
//! enforcement layer (intentional — see `src/freebl.rs`).  This means blapi
//! AEAD operations must succeed regardless of FIPS mode; FIPS enforcement is
//! a PKCS#11/softoken concern, not a freebl concern.
//!
//! Each test file in `tests/` compiles to an independent binary, so
//! `fixture_init_fips` runs before any other NSS initialization in this suite.

#![cfg(feature = "blapi")]
#![cfg(not(feature = "disable-encryption"))]

use nss_rs::constants::{
    TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256,
};
use test_fixture::fixture_init_fips;

mod common;

/// Verify that blapi AEAD works with all three TLS 1.3 cipher suites when NSS
/// is in FIPS mode.  blapi bypasses PKCS#11 FIPS enforcement entirely, so the
/// cipher suites work regardless of whether they are individually FIPS-approved.
#[test]
fn blapi_fips_roundtrip() {
    if !fixture_init_fips() {
        // Non-certified NSS build (e.g. macOS Homebrew): FIPS HMAC check fails.
        // This test is meaningful only on a FIPS-capable NSS installation.
        println!("SKIP: NSS FIPS mode not available on this platform");
        return;
    }
    let secret = common::import_secret();
    for cipher in [
        TLS_AES_128_GCM_SHA256,
        TLS_AES_256_GCM_SHA384,
        TLS_CHACHA20_POLY1305_SHA256,
    ] {
        common::roundtrip(&secret, cipher);
    }
}
