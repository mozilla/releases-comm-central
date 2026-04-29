// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

// This uses external interfaces to nss-rs rather than being a module
// inside of lib.rs. Because all other code uses the test_fixture module,
// they will be calling into the public version of init_db().  Calling into
// the version exposed to an inner module in lib.rs would result in calling
// a different version of init_db.  That causes explosions as they get
// different versions of the Once instance they use and they initialize NSS
// twice, probably likely in parallel.  That doesn't work out well.
use nss_rs::assert_initialized;
#[cfg(nss_nodb)]
use nss_rs::init;
#[cfg(not(nss_nodb))]
use nss_rs::init_db;

// Pull in the NSS internals so that we can ask NSS if it thinks that
// it is properly initialized.
#[expect(
    non_upper_case_globals,
    dead_code,
    reason = "Code is bindgen-generated."
)]
mod nss {
    use nss_rs::nss_prelude::*;
    include!(concat!(env!("OUT_DIR"), "/nss_init.rs"));
}

#[cfg(nss_nodb)]
#[test]
fn init_nodb() {
    nss_rs::init().unwrap();
    assert_initialized();
    unsafe {
        assert_ne!(nss::NSS_IsInitialized(), 0);
    }
}

#[cfg(not(nss_nodb))]
#[test]
fn init_withdb() {
    init_db(::test_fixture::NSS_DB_PATH).unwrap();
    assert_initialized();
    unsafe {
        assert_ne!(nss::NSS_IsInitialized(), 0);
    }
}
