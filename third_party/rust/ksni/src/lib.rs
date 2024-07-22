//! A Rust implementation of the KDE/freedesktop StatusNotifierItem specification
//!
//! See the [README.md](https://github.com/iovxw/ksni) for an example

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

mod dbus_ext;
mod dbus_interface;
mod error;
mod freedesktop;
pub mod menu;
mod service;
mod tray;

#[doc(inline)]
pub use menu::{MenuItem, TextDirection};
pub use service::TrayService;
pub use tray::{Category, Icon, Status, ToolTip};

/// A system tray, implement this to create your tray
///
/// **NOTE**: On some system trays, [`Tray::id`] is a required property to avoid unexpected behaviors
pub trait Tray: Sized {
    /// Asks the status notifier item for activation, this is typically a
    /// consequence of user input, such as mouse left click over the graphical
    /// representation of the item.
    /// The application will perform any task is considered appropriate as an
    /// activation request.
    ///
    /// the x and y parameters are in screen coordinates and is to be considered
    /// an hint to the item where to show eventual windows (if any).
    fn activate(&mut self, _x: i32, _y: i32) {}

    /// Is to be considered a secondary and less important form of activation
    /// compared to Activate.
    /// This is typically a consequence of user input, such as mouse middle
    /// click over the graphical representation of the item.
    /// The application will perform any task is considered appropriate as an
    /// activation request.
    ///
    /// the x and y parameters are in screen coordinates and is to be considered
    /// an hint to the item where to show eventual windows (if any).
    fn secondary_activate(&mut self, _x: i32, _y: i32) {}

    /// The user asked for a scroll action. This is caused from input such as
    /// mouse wheel over the graphical representation of the item.
    ///
    /// The delta parameter represent the amount of scroll, the orientation
    /// parameter represent the horizontal or vertical orientation of the scroll
    /// request and its legal values are horizontal and vertical.
    fn scroll(&mut self, _delta: i32, _dir: &str) {}

    /// Describes the category of this item.
    fn category(&self) -> Category {
        tray::Category::ApplicationStatus
    }

    /// It's a name that should be unique for this application and consistent
    /// between sessions, such as the application name itself.
    fn id(&self) -> String {
        Default::default()
    }

    /// It's a name that describes the application, it can be more descriptive
    /// than Id.
    fn title(&self) -> String {
        Default::default()
    }

    /// Describes the status of this item or of the associated application.
    fn status(&self) -> Status {
        tray::Status::Active
    }

    // NOTE: u32 in org.freedesktop.StatusNotifierItem
    /// It's the windowing-system dependent identifier for a window, the
    /// application can chose one of its windows to be available through this
    /// property or just set 0 if it's not interested.
    fn window_id(&self) -> i32 {
        0
    }

    /// An additional path to add to the theme search path to find the icons.
    fn icon_theme_path(&self) -> String {
        Default::default()
    }

    /// The item only support the context menu, the visualization
    /// should prefer showing the menu or sending ContextMenu()
    /// instead of Activate()
    // fn item_is_menu() -> bool { false }

    /// The StatusNotifierItem can carry an icon that can be used by the
    /// visualization to identify the item.
    fn icon_name(&self) -> String {
        Default::default()
    }

    /// Carries an ARGB32 binary representation of the icon
    fn icon_pixmap(&self) -> Vec<Icon> {
        Default::default()
    }

    /// The Freedesktop-compliant name of an icon. This can be used by the
    /// visualization to indicate extra state information, for instance as an
    /// overlay for the main icon.
    fn overlay_icon_name(&self) -> String {
        Default::default()
    }

    /// ARGB32 binary representation of the overlay icon described in the
    /// previous paragraph.
    fn overlay_icon_pixmap(&self) -> Vec<Icon> {
        Default::default()
    }

    /// The Freedesktop-compliant name of an icon. this can be used by the
    /// visualization to indicate that the item is in RequestingAttention state.
    fn attention_icon_name(&self) -> String {
        Default::default()
    }

    /// ARGB32 binary representation of the requesting attention icon describe in
    /// the previous paragraph.
    fn attention_icon_pixmap(&self) -> Vec<Icon> {
        Default::default()
    }

    /// An item can also specify an animation associated to the
    /// RequestingAttention state.
    /// This should be either a Freedesktop-compliant icon name or a full path.
    /// The visualization can chose between the movie or AttentionIconPixmap (or
    /// using neither of those) at its discretion.
    fn attention_movie_name(&self) -> String {
        Default::default()
    }

    /// Data structure that describes extra information associated to this item,
    /// that can be visualized for instance by a tooltip (or by any other mean
    /// the visualization consider appropriate.
    fn tool_tip(&self) -> ToolTip {
        Default::default()
    }

    /// Represents the way the text direction of the application.  This
    /// allows the server to handle mismatches intelligently.
    fn text_direction(&self) -> TextDirection {
        menu::TextDirection::LeftToRight
    }

    /// The menu that you want to display
    fn menu(&self) -> Vec<MenuItem<Self>> {
        Default::default()
    }

    /// The `org.kde.StatusNotifierWatcher` is online
    fn watcher_online(&self) {}

    /// The `org.kde.StatusNotifierWatcher` is offine
    ///
    /// You can setup a fallback tray here
    ///
    /// Return `false` to shutdown the tray service
    fn watcher_offine(&self) -> bool {
        true
    }
}

/// Handle to the tray
pub struct Handle<T> {
    tray_status: TrayStatus,
    model: Arc<Mutex<T>>,
}

#[doc(hidden)]
#[deprecated(note = "State is renamed to Handle")]
pub type State<T> = Handle<T>;

impl<T: Tray> Handle<T> {
    /// Update the tray
    pub fn update<R, F: FnOnce(&mut T) -> R>(&self, f: F) -> R {
        let ret = f(&mut self.model.lock().unwrap());
        self.tray_status.need_update();
        ret
    }

    /// Shutdown the tray service
    pub fn shutdown(&self) {
        self.tray_status.stop();
    }
}

impl<T> Clone for Handle<T> {
    fn clone(&self) -> Self {
        Handle {
            tray_status: self.tray_status.clone(),
            model: self.model.clone(),
        }
    }
}

#[derive(Clone, Default)]
struct TrayStatus {
    stop: Arc<AtomicBool>,
    need_update: Arc<AtomicBool>,
}

impl TrayStatus {
    fn need_update(&self) {
        self.need_update.store(true, Ordering::Release);
    }

    fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }

    fn take(&self) -> CurrentTrayStatus {
        if self.stop.load(Ordering::Acquire) {
            CurrentTrayStatus::Stop
        } else if self.need_update.swap(false, Ordering::AcqRel) {
            CurrentTrayStatus::NeedUpdate
        } else {
            CurrentTrayStatus::Idle
        }
    }
}

enum CurrentTrayStatus {
    NeedUpdate,
    Stop,
    Idle,
}
