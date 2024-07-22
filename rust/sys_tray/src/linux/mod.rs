/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use fluent::FluentBundle;
use ksni::Handle;
use nserror::{nsresult, NS_OK};
use std::os::raw::c_void;
use system_tray::{SystemTray, TrayItem, XdgIcon};
use xpcom::{nsIID, xpcom_method, RefPtr};

use crate::{locales, Action};

pub mod system_tray;

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
        let mut bundle = FluentBundle::new(locs);
        bundle
            .add_resource(resource)
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
        service.spawn();
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
}
