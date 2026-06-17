/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Action handling for the tray icon implementation

use nserror::nsresult;
use xpcom::get_service;
use xpcom::interfaces::nsIAppStartup;

/// Actions from the tray menu
/// Note: For thread safety we *must* safely support Copy!
#[derive(Clone, Copy, Debug)]
pub enum Action {
    /// Quit menu has been pressed
    Quit,
}

/// Handle the given action in the tray menu
///
/// This private handler is always executed on the main thread
/// and should not be directly called outside of the current
/// threading design.
pub(crate) fn handle_action(action: Action) -> Result<(), nsresult> {
    match &action {
        Action::Quit => request_quit(),
    }
}

/// Request the application quit
///
/// This can only be called on the main thread.
fn request_quit() -> Result<(), nsresult> {
    let mut cancelled = false;
    let service = get_service::<nsIAppStartup>(c"@mozilla.org/toolkit/app-startup;1")
        .ok_or(nserror::NS_ERROR_NO_INTERFACE)?;
    unsafe {
        service
            .Quit(nsIAppStartup::eAttemptQuit, 0, &raw mut cancelled)
            .to_result()?;
    }
    Ok(())
}
