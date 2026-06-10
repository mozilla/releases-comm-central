// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#![expect(clippy::unwrap_used, reason = "This is test code.")]

use std::{
    cell::OnceCell,
    path::PathBuf,
    sync::{Once, OnceLock},
    time::{Duration, Instant},
};

use nss_rs::{AntiReplay, TEST_FIXTURE_DB, TEST_FIXTURE_DB_FIPS, init_db, p11::PK11_IsFIPS};

/// Returns the path to the NSS test fixture database.
///
/// Reads the `TEST_FIXTURE_DB` environment variable if set, falling back to
/// [`TEST_FIXTURE_DB`].  If the value is `$ARGV0`, returns the directory of
/// the current executable instead.
#[must_use]
pub fn db_path() -> PathBuf {
    match std::env::var("TEST_FIXTURE_DB").as_deref() {
        Ok("$ARGV0") => {
            let mut exe = std::env::current_exe().unwrap();
            exe.pop();
            exe
        }
        Ok(path) => PathBuf::from(path),
        Err(_) => PathBuf::from(TEST_FIXTURE_DB),
    }
}

static FIXTURE_INIT: Once = Once::new();

/// Initialize the test fixture.  Only call this if you aren't also calling a
/// fixture function that depends on setup.  Other functions in the fixture
/// that depend on this setup call the function for you.
///
/// # Panics
///
/// When the NSS initialization fails.
pub fn fixture_init() {
    FIXTURE_INIT.call_once(|| {
        init_db(db_path()).unwrap();
    });
}

/// Initialize the test fixture with the FIPS-mode NSS database.
///
/// Returns `true` if NSS was successfully initialized in FIPS mode, or `false`
/// if FIPS mode is not supported on this platform (e.g. a non-certified NSS
/// build).  The caller should skip the test when this returns `false`.
pub fn fixture_init_fips() -> bool {
    static FIPS: OnceLock<bool> = OnceLock::new();
    *FIPS.get_or_init(|| {
        FIXTURE_INIT.call_once(|| {
            // Ignore errors — non-certified NSS builds (e.g. macOS Homebrew) fail
            // the FIPS HMAC check and cannot initialize with a FIPS database.
            _ = init_db(TEST_FIXTURE_DB_FIPS);
        });
        // SAFETY: NSS must be initialized before calling PK11_IsFIPS.
        unsafe { PK11_IsFIPS() != 0 }
    })
}

// This needs to be > 2ms to avoid it being rounded to zero.
// NSS operates in milliseconds and halves any value it is provided.
// But make it a second, so that tests with reasonable RTTs don't fail.
pub const ANTI_REPLAY_WINDOW: Duration = Duration::from_secs(1);

/// A baseline time for all tests.  This needs to be earlier than what `now()` produces
/// because of the need to have a span of time elapse for anti-replay purposes.
#[expect(
    clippy::disallowed_methods,
    reason = "Test fixture is the time source for tests."
)]
fn earlier() -> Instant {
    // Note: It is only OK to have a different base time for each thread because our tests are
    // single-threaded.
    thread_local!(static EARLIER: OnceCell<Instant> = const { OnceCell::new() });
    fixture_init();
    EARLIER.with(|b| *b.get_or_init(Instant::now))
}

/// The current time for the test.  Which is in the future,
/// because 0-RTT tests need to run at least `ANTI_REPLAY_WINDOW` in the past.
///
/// # Panics
///
/// When the setup fails.
#[must_use]
pub fn now() -> Instant {
    earlier().checked_add(ANTI_REPLAY_WINDOW).unwrap()
}

/// Create a default anti-replay context.
///
/// # Panics
///
/// When the setup fails.
#[must_use]
pub fn anti_replay() -> AntiReplay {
    AntiReplay::new(earlier(), ANTI_REPLAY_WINDOW, 1, 3).expect("setup anti-replay")
}

/// Take a valid ECH config (as bytes) and produce a damaged version of the same.
///
/// This will appear valid, but it will contain a different ECH config ID.
/// If given to a client, this should trigger an ECH retry.
/// This only damages the config ID, which works as we only support one on our server.
///
/// # Panics
/// When the provided `config` has the wrong version.
#[must_use]
pub fn damage_ech_config(config: &[u8]) -> Vec<u8> {
    let mut cfg = config.to_owned();
    // Ensure that the version is correct.
    assert_eq!(cfg[2], 0xfe);
    assert_eq!(cfg[3], 0x0d);
    // Change the config_id so that the server doesn't recognize it.
    cfg[6] ^= 0x94;
    cfg
}
