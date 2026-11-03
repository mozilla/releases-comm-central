/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use dbus::Message;
use dbus::arg::{RefArg, Variant};
use dbus::channel::Sender;
use dbus::strings::BusName;
use fluent_ffi::{FluentBundleRc, adapt_bundle_for_gecko};
use nserror::{NS_OK, nsresult};
use nsstring::nsCString;
use std::collections::BTreeMap;
use std::env;
use std::ffi::CStr;
use std::os::raw::c_void;
use std::path::Path;
use std::rc::Rc;
use std::sync::Mutex;
use std::thread;
use system_tray::{SystemTray, TrayItem, XdgIcon};
use xpcom::interfaces::{imgIContainer, nsIPrefBranch};
use xpcom::{RefPtr, get_service, nsIID, xpcom_method};

use crate::{Action, locales};

unsafe extern "C" {
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
    let prefs_service = get_service::<nsIPrefBranch>(c"@mozilla.org/preferences-service;1")?;
    unsafe {
        prefs_service
            .GetBoolPref(name.as_ptr(), &mut value)
            .to_result()
            .ok()?;
    }
    Some(value)
}

fn launcher_uri_from_desktop_file(variable: &str) -> Option<String> {
    let path = env::var_os(variable)?;
    let file_name = Path::new(&path).file_name()?.to_str()?;
    file_name
        .ends_with(".desktop")
        .then(|| format!("application://{file_name}"))
}

fn unity_launcher_uri() -> String {
    const FALLBACK: &str = "application://thunderbird.desktop";

    if let Ok(flatpak_id) = env::var("FLATPAK_ID") {
        if !flatpak_id.is_empty() {
            return format!("application://{flatpak_id}.desktop");
        }
    }

    if let Some(uri) = launcher_uri_from_desktop_file("SNAP_APP_DESKTOP_FILE") {
        return uri;
    }

    let gio_pid = env::var("GIO_LAUNCHED_DESKTOP_FILE_PID")
        .ok()
        .and_then(|pid| pid.parse::<u32>().ok());
    if gio_pid == Some(std::process::id())
        && let Some(uri) = launcher_uri_from_desktop_file("GIO_LAUNCHED_DESKTOP_FILE")
    {
        return uri;
    }

    FALLBACK.to_string()
}

fn emit_unity_launcher_count(connection: &dbus::blocking::Connection, count: u32) -> bool {
    let mut properties: BTreeMap<&str, Variant<Box<dyn RefArg>>> = BTreeMap::new();
    let count_value: Box<dyn RefArg> = Box::new(i64::from(count));
    let visible_value: Box<dyn RefArg> = Box::new(count > 0);
    properties.insert("count", Variant(count_value));
    properties.insert("count-visible", Variant(visible_value));

    let Ok(mut message) =
        Message::new_signal("/Unity", "com.canonical.Unity.LauncherEntry", "Update")
    else {
        log::debug!("Failed to create Unity launcher update signal");
        return false;
    };

    let Ok(destination) = BusName::new("com.canonical.Unity") else {
        log::debug!("Failed to create Unity launcher destination");
        return false;
    };
    message.set_destination(Some(destination));

    let message = message.append2(unity_launcher_uri(), properties);
    if connection.send(message).is_err() {
        log::debug!("Failed to send Unity launcher update signal");
        return false;
    }
    connection.channel().flush();
    true
}

/// Construct a new xpcom object for tray handling on Linux
///
/// Note eventually this will move back into the main crate
/// when we can handle all tray types.
///
/// # Safety
///
/// Reliant on the xpcom system, exports as a C function
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nsLinuxSysTrayHandlerConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = LinuxSysTrayHandler::new();
    unsafe { instance.QueryInterface(iid, result) }
}

/// System tray implementation for Linux
#[xpcom::xpcom(implement(nsIMessengerOSIntegration), atomic)]
pub struct LinuxSysTrayHandler {
    handle: ksni::Handle<SystemTray>,
    unity_connection: Mutex<Option<dbus::blocking::Connection>>,
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

        let app_name = bundle
            .get_message("system-tray-app-name")
            .expect("Message doesn't exist.")
            .value()
            .expect("Message has no value.");
        let mut errors = vec![];
        let app_name = bundle.format_pattern(app_name, None, &mut errors);
        if !errors.is_empty() {
            log::error!(target: "system_tray", "translation issues: {errors:?}");
        }

        // Grab the quit message
        let msg = bundle
            .get_message("system-tray-menuitem-quit")
            .expect("Message doesn't exist.")
            .value()
            .expect("Message has no value.");
        let mut errors = vec![];
        let quit_msg = bundle.format_pattern(msg, None, &mut errors);
        if !errors.is_empty() {
            log::error!(target: "system_tray", "translation issues: {errors:?}");
        }

        // We need a PNG image until KDE and Gnome issues with
        // org.freedesktop.StatusNotifierItem.OverlayIconPixmap have been resolved.
        // Uncomment this when it has.
        // let icon = if XdgIcon::requires_symbolic() {
        //     system_tray::locate_icon_on_system("TB-symbolic.svg").map(XdgIcon::Path)
        // } else {
        //     system_tray::locate_icon_on_system("default256.png").map(XdgIcon::Path)
        // }
        //     .ok()
        //     .unwrap_or_else(|| XdgIcon::for_desktop("thunderbird"));
        let icon = system_tray::locate_icon_on_system("default256.png")
            .map(XdgIcon::Path)
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

        let tray = SystemTray::new("Thunderbird", icon, app_name).with_items(menus);
        let service = ksni::TrayService::new(tray);
        let handle = service.handle();
        if get_bool_pref(c"mail.biff.show_tray_icon_always").unwrap_or(true) {
            thread::spawn(|| match service.run_without_dbus_name() {
                Ok(_) => (),
                Err(e) => log::error!(target: "system_tray", "Spawning system tray FAILED: {e}"),
            });
        }
        let unity_connection = match dbus::blocking::Connection::new_session() {
            Ok(connection) => {
                emit_unity_launcher_count(&connection, 0);
                Some(connection)
            }
            Err(error) => {
                log::debug!("Failed to connect to session bus: {error}");
                None
            }
        };
        LinuxSysTrayHandler::allocate(InitLinuxSysTrayHandler {
            handle,
            unity_connection: Mutex::new(unity_connection),
        })
    }

    fn emit_unity_launcher_count(&self, count: u32) {
        let Ok(mut connection) = self.unity_connection.lock() else {
            return;
        };
        if connection.is_none() {
            match dbus::blocking::Connection::new_session() {
                Ok(new_connection) => *connection = Some(new_connection),
                Err(error) => {
                    log::debug!("Failed to connect to session bus: {error}");
                    return;
                }
            }
        }

        if let Some(active_connection) = connection.as_ref() {
            if !emit_unity_launcher_count(active_connection, count) {
                *connection = None;
            }
        }
    }

    // Update the unread count badge on the system tray icon and on desktops
    // that support the Unity launcher API, such as KDE Plasma's task manager.
    xpcom_method!(update_unread_count => UpdateUnreadCount(unreadCount: u32, unreadToolTip: *const nsstring::nsAString, imgContainer: *const imgIContainer));
    unsafe fn update_unread_count(
        &self,
        count: u32,
        tooltip: &nsstring::nsAString,
        img_container: Option<&imgIContainer>,
    ) -> Result<(), nsresult> {
        self.handle.update(|tray| {
            tray.update_unread_count(count, tooltip.to_string(), img_container);
        });
        self.emit_unity_launcher_count(count);
        Ok(())
    }

    // Handle any cleanups
    xpcom_method!(on_exit => OnExit());
    fn on_exit(&self) -> Result<(), nsresult> {
        self.emit_unity_launcher_count(0);
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
