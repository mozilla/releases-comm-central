/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use cstr::cstr;
use fluent_ffi::{adapt_bundle_for_gecko, FluentBundleRc};
use ksni::Handle;
use nserror::{nsresult, NS_OK};
use nsstring::nsCString;
use std::ffi::CStr;
use std::os::raw::c_void;
use std::rc::Rc;
use std::thread;
use system_tray::{SystemTray, TrayItem, XdgIcon};
use xpcom::interfaces::nsIPrefBranch;
use xpcom::{get_service, nsIID, xpcom_method, RefPtr};

use crate::{locales, Action};

extern "C" {
    pub fn nsGNOMEShellService_GetGSettingsBoolean(
        schema: &nsCString,
        key: &nsCString,
        default: bool,
    ) -> bool;
}

pub mod system_tray;

/// Retrieves the boolean value associated with the given
/// pref.
fn get_bool_pref(name: &CStr) -> Option<bool> {
    let mut value = false;
    let prefs_service = get_service::<nsIPrefBranch>(cstr!("@mozilla.org/preferences-service;1"))?;
    unsafe {
        prefs_service
            .GetBoolPref(name.as_ptr(), &mut value)
            .to_result()
            .ok()?;
    }
    Some(value)
}

/// Construct a new xpcom object for tray handling on Linux
///
/// Note eventually this will move back into the main crate
/// when we can handle all tray types.
///
/// # Safety
///
/// Reliant on the xpcom system, exports as a C function
#[no_mangle]
pub unsafe extern "C" fn nsLinuxSysTrayHandlerConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = LinuxSysTrayHandler::new();
    instance.QueryInterface(iid, result)
}

/// System tray implementation for Linux
#[xpcom::xpcom(implement(nsIMessengerOSIntegration), atomic)]
pub struct LinuxSysTrayHandler {
    handle: Handle<SystemTray>,
}

impl LinuxSysTrayHandler {
    /// Construct a new system tray
    pub fn new() -> RefPtr<LinuxSysTrayHandler> {
        let locs = locales::app_locales().expect("Failed to retrieve application locales");
        let resource = locales::fl_resource().expect("Failed to parse fluent templates");
        let mut bundle = FluentBundleRc::new(locs);
        adapt_bundle_for_gecko(&mut bundle, None);

        bundle
            .add_resource(Rc::new(resource))
            .expect("Failed to add resources to bundle");

        // Grab the quit message
        let msg = bundle
            .get_message("system-tray-menu-quit")
            .expect("Message doesn't exist.");
        let mut errors = vec![];
        let label = msg.get_attribute("label").expect("Message doesn't exist.");
        let quit_msg = bundle.format_pattern(label.value(), None, &mut errors);
        if !errors.is_empty() {
            log::error!("translation issues: {errors:?}");
        }

        // Determine correct image
        let icon = if XdgIcon::requires_symbolic() {
            system_tray::locate_icon_on_system("TB-symbolic.svg").map(XdgIcon::Path)
        } else {
            system_tray::locate_icon_on_system("default256.png").map(XdgIcon::Path)
        }
        .ok()
        .unwrap_or_else(|| XdgIcon::for_desktop("thunderbird"));

        // Build our menu structure
        let menus = [TrayItem::ActionItem {
            label: quit_msg.into(),
            icon: None,
            action: Action::Quit,
            enabled: true,
            visible: true,
        }];

        // Get it executed
        let tray = SystemTray::new("Thunderbird", icon, "Thunderbird Daily").with_items(menus);
        let service = ksni::TrayService::new(tray);
        let handle = service.handle();
        if get_bool_pref(cstr!("mail.biff.show_tray_icon_always")).unwrap_or(true) {
            thread::spawn(|| match service.run_without_dbus_name() {
                Ok(_) => (),
                Err(e) => log::error!("Spawning system tray FAILED: {e}"),
            });
        }
        LinuxSysTrayHandler::allocate(InitLinuxSysTrayHandler { handle })
    }

    // Update the unread method count (unimplemented as yet)
    xpcom_method!(update_unread_count => UpdateUnreadCount(unreadCount: u32, unreadToolTip: *const nsstring::nsAString));
    fn update_unread_count(
        &self,
        _count: u32,
        _tooltip: &nsstring::nsAString,
    ) -> Result<(), nsresult> {
        Ok(())
    }

    // Handle any cleanups
    xpcom_method!(on_exit => OnExit());
    fn on_exit(&self) -> Result<(), nsresult> {
        self.handle.shutdown();
        Ok(())
    }

    // Check whether Do Not Disturb is currently enabled.
    //
    // This is done by reading GSettings and checking if either
    // `org.freedesktop.Notifications.Inhibited` is true, or if
    // `org.gnome.desktop.notifications.show-banners` is false.
    xpcom_method!(get_is_in_do_not_disturb_mode => GetIsInDoNotDisturbMode() -> bool);
    fn get_is_in_do_not_disturb_mode(&self) -> Result<bool, nsresult> {
        let value;
        unsafe {
            value = nsGNOMEShellService_GetGSettingsBoolean(
                &nsCString::from("org.freedesktop.Notifications"),
                &nsCString::from("Inhibited"),
                false,
            );
        }
        if value {
            return Ok(true);
        }

        let value;
        unsafe {
            value = nsGNOMEShellService_GetGSettingsBoolean(
                &nsCString::from("org.gnome.desktop.notifications"),
                &nsCString::from("show-banners"),
                true,
            );
        }
        if !value {
            return Ok(true);
        }

        Ok(false)
    }
}
