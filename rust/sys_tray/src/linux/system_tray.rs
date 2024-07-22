/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::fs;
use std::{env, fmt, sync::OnceLock};

use nserror::nsresult;
use xpcom::interfaces::nsIThread;
use xpcom::RefPtr;

use crate::Action;

/// Status Notifier Item (Tray Area Icon) model
pub struct SystemTray {
    /// unique identity
    id: &'static str,

    /// application title
    title: String,

    /// the main icon to use
    icon: XdgIcon,

    /// Menu items
    items: Vec<TrayItem>,
}

/// Locate an icon resource on disk
pub(crate) fn locate_icon_on_system(path: &'static str) -> Result<String, nsresult> {
    let our_binary = env::current_exe().map_err(|_| nserror::NS_ERROR_FILE_NOT_FOUND)?;
    let binary_dir = our_binary
        .parent()
        .ok_or(nserror::NS_ERROR_FILE_NOT_FOUND)?;

    let path = binary_dir
        .join("chrome")
        .join("icons")
        .join("default")
        .join(path);
    let result = fs::canonicalize(path).map_err(|_| nserror::NS_ERROR_FILE_NOT_FOUND)?;

    Ok(result.to_string_lossy().to_string())
}

/// Encapsulate standard vs symbolic differences
///
/// Certain desktop environments (notably GNOME) support
/// named "-symbolic" icons, ie monochrome icons that can
/// be styled using CSS where appropriate.
///
/// In order to facilitate better integration we attempt to pick
/// a `-symbolic` icon automatically when using the GNOME Desktop
/// or indeed a GNOME-*based* desktop (via `XDG_CURRENT_DESKTOP` var)
///
/// Note, it is entirely up to the SNI host implementation to correctly
/// implement XDG Icon Theme lookup logic, splitting on hyphenated fragments
/// in the icon name and checking existence of an icon in the cache.
pub enum XdgIcon {
    /// Standard freedesktop icon name
    Standard(&'static str),

    /// A symbolic icon
    Symbolic(&'static str),

    /// Path to an image on disk
    Path(String),
}

impl XdgIcon {
    /// Determine if the DE prefers symbolic icons (i.e. GNOME + GNOME-based)
    pub fn requires_symbolic() -> bool {
        static SYMBOLICS: OnceLock<bool> = OnceLock::new();

        let b = SYMBOLICS.get_or_init(|| {
            env::var("XDG_CURRENT_DESKTOP")
                .unwrap_or_default()
                .replace(';', ":")
                .split(':')
                .map(|s| s.to_lowercase())
                .any(|i| i == "gnome")
        });

        *b
    }

    /// Generate the correct icon variant for the current desktop environment
    pub fn for_desktop(name: &'static str) -> Self {
        if Self::requires_symbolic() {
            XdgIcon::Symbolic(name)
        } else {
            XdgIcon::Standard(name)
        }
    }
}

impl fmt::Display for XdgIcon {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            XdgIcon::Standard(n) => f.write_str(n),
            XdgIcon::Symbolic(n) => f.write_fmt(format_args!("{n}-symbolic")),
            XdgIcon::Path(p) => f.write_str(p),
        }
    }
}

/// Encapsulate the `[ksni::MenuItem]` types to control actions
pub enum TrayItem {
    /// Actionable (single click) item
    ActionItem {
        /// Display label
        label: String,

        /// Icon name
        icon: Option<XdgIcon>,

        /// The action to perform when selecting this item
        action: Action,

        /// Is this enabled?
        enabled: bool,

        /// And is it visible?
        visible: bool,
    },
}

impl From<&TrayItem> for ksni::MenuItem<SystemTray> {
    fn from(value: &TrayItem) -> Self {
        match value {
            TrayItem::ActionItem {
                label,
                action,
                enabled,
                visible,
                icon,
            } => {
                let act = *action;
                Self::Standard(ksni::menu::StandardItem {
                    label: label.clone(),
                    enabled: *enabled,
                    visible: *visible,
                    activate: Box::new(move |tray| {
                        tray.dispatch_action(act)
                            .expect("Couldn't send to main thread");
                    }),
                    icon_name: icon.as_ref().map(|i| i.to_string()).unwrap_or_default(),
                    ..Default::default()
                })
            }
        }
    }
}

impl SystemTray {
    /// Dispatchs the provided action to the main thread
    ///
    /// The main thread's `handle_action` function will then further process the
    /// action, calling other XPCOM interfaces, etc.
    fn dispatch_action(&self, action: Action) -> Result<(), nsresult> {
        // Now, dispatch to the main thread
        let main_thread: RefPtr<nsIThread> = moz_task::get_main_thread()?;
        moz_task::dispatch_onto("linux_sys_tray_dispatch", main_thread.coerce(), move || {
            if let Err(e) = crate::handle_action(action) {
                eprintln!("Failed to execute action: {action:?}: {e}");
            }
        })?;

        Ok(())
    }

    /// Create a new tray icon with the given title
    pub fn new(id: &'static str, icon: XdgIcon, title: impl AsRef<str>) -> Self {
        Self {
            id,
            icon,
            title: title.as_ref().to_string(),
            items: vec![],
        }
    }

    /// Create with the given items
    pub fn with_items(self, items: impl IntoIterator<Item = TrayItem>) -> Self {
        Self {
            items: items.into_iter().collect::<Vec<_>>(),
            ..self
        }
    }
}

impl ksni::Tray for SystemTray {
    fn id(&self) -> String {
        self.id.to_string()
    }

    fn title(&self) -> String {
        self.title.clone()
    }

    fn status(&self) -> ksni::Status {
        ksni::Status::Active
    }

    fn icon_name(&self) -> String {
        self.icon.to_string()
    }

    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        self.items.iter().map(|i| i.into()).collect::<Vec<_>>()
    }
}
