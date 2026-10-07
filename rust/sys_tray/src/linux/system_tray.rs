/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::Action;
use nserror::nsresult;
use nsstring::{nsACString, nsAString, nsCString, nsString};
use std::io::{BufRead, BufReader, Cursor, Seek};
use std::os::raw::c_char;
use std::{env, fmt, sync::OnceLock};
use std::{fs, vec};
use thin_vec::ThinVec;
use xpcom::interfaces::{
    imgIContainer, imgITools, nsIInputStream, nsIMessengerLinuxTrayIntegration, nsIThread,
};
use xpcom::{GetterAddrefs, RefPtr, get_service};

struct IconData {
    pub width: i32,
    pub height: i32,
    pub rgba_data: ThinVec<u8>,
}

impl IconData {
    fn into_ksni_icon(self) -> Vec<ksni::Icon> {
        let mut data = Vec::with_capacity(self.rgba_data.len());

        // Convert RGBA to ARGB to match ksni's format
        for i in 0..(self.rgba_data.len() / 4) {
            let j = i * 4;
            data.push(self.rgba_data[j + 3]);
            data.push(self.rgba_data[j]);
            data.push(self.rgba_data[j + 1]);
            data.push(self.rgba_data[j + 2]);
        }

        vec![ksni::Icon {
            width: self.width,
            height: self.height,
            data,
        }]
    }
}

pub(crate) fn read_stream(stream: &nsIInputStream) -> Result<Vec<u8>, nsresult> {
    let mut bytes_available = 0;
    unsafe { stream.Available(&mut bytes_available) }.to_result()?;

    // `nsIInputStream::Available` reads into a u64, but `nsIInputStream::Read`
    // takes a u32.
    let bytes_available = <u32>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?;

    let mut read_sink: Vec<u8> =
        vec![0; <usize>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?];

    // The amount of bytes actually read from the stream.
    let mut bytes_read: u32 = 0;

    // SAFETY: The call contract from `nsIInputStream::Read` guarantees that the
    // bytes written into the provided buffer is of type c_char (char* in
    // C-land) and is contiguous for the length it writes in `bytes_read`; and
    // that `bytes_read` is not greater than `bytes_available`.
    unsafe {
        let read_ptr = read_sink.as_mut_ptr();

        stream
            .Read(read_ptr as *mut c_char, bytes_available, &mut bytes_read)
            .to_result()?;
    };

    // TODO: We currently assume all of the data we care about is in the stream
    // when we read, which might not be the case if we're copying multiple
    // messages.
    let bytes_read = <usize>::try_from(bytes_read).or(Err(nserror::NS_ERROR_FAILURE))?;
    Ok(Vec::from(&read_sink[..bytes_read]))
}

/**
 * TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2078845
 * This code uses the `png` Rust crate. It should be replaced
 * by Gecko's internal APIs.
 */
fn decode_png<R: BufRead + Seek>(buffer: R) -> Option<IconData> {
    let decoder = png::Decoder::new(buffer);
    let mut reader = decoder.read_info().ok()?;
    let info = reader.info();
    let width = info.width as i32;
    let height = info.height as i32;
    let image_size = reader.output_buffer_size()?;
    let mut data = vec![0; image_size];
    let _ = reader.next_frame(&mut data).ok()?;

    Some(IconData {
        width,
        height,
        rgba_data: ThinVec::from(data),
    })
}

fn decode_image_from_img_container(img_container: &imgIContainer) -> Result<IconData, ()> {
    let img_tools = get_service::<imgITools>(c"@mozilla.org/image/tools;1").ok_or(())?;
    let mut image_stream_ref = GetterAddrefs::<nsIInputStream>::new();

    unsafe {
        let mime_type: *const nsACString = &*nsCString::from("image/png");
        let output_options: *const nsAString = &*nsString::from("");
        img_tools.EncodeImage(
            img_container,
            mime_type,
            output_options,
            image_stream_ref.ptr(),
        );
    }

    let stream = image_stream_ref.refptr().ok_or(())?;
    let png_data = read_stream(&stream).or(Err(()))?;

    let mut width = 0;
    let mut height = 0;

    unsafe {
        img_container.GetWidth(&mut width);
        img_container.GetHeight(&mut height);
    }

    let icon = decode_png(Cursor::new(png_data)).ok_or_else(|| {
        log::error!(target: "system_tray", "Unable to decode tray icon's new mail overlay");
        ()
    })?;

    log::debug!(target: "system_tray",
        "Decoded image with dimensions {}x{} accounting for {} bytes.",
        width,
        height,
        icon.rgba_data.len()
    );

    Ok(icon)
}

fn load_image_from_disk(icon: &XdgIcon) -> Option<IconData> {
    let file = fs::File::open(icon.path()?).ok()?;
    decode_png(BufReader::new(file)).or_else(|| {
        log::warn!(target: "system_tray", "Unable to open or decode image for icon {icon}");
        None
    })
}

/// Status Notifier Item (Tray Area Icon) model
pub struct SystemTray {
    /// unique identity
    id: &'static str,

    /// application title
    title: String,

    /// the main icon to use
    icon: XdgIcon,

    /// the main icon to use
    icon_pixmap: Vec<ksni::Icon>,

    /// cached version of self.icon to pass to
    cached_icon_pixmap: Option<IconData>,

    /// Menu items
    items: Vec<TrayItem>,

    /// Number of unread mails
    unread_count: u32,

    /// Description to display on systray's tooltip when there are unread mails
    tooltip: String,
}

/// Locate an icon resource on disk
pub(crate) fn locate_icon_on_system(path: &'static str) -> Result<String, nsresult> {
    let our_binary = env::current_exe().or(Err(nserror::NS_ERROR_FILE_NOT_FOUND))?;
    let binary_dir = our_binary
        .parent()
        .ok_or(nserror::NS_ERROR_FILE_NOT_FOUND)?;

    let path = binary_dir
        .join("chrome")
        .join("icons")
        .join("default")
        .join(path);
    let result = fs::canonicalize(path).or(Err(nserror::NS_ERROR_FILE_NOT_FOUND))?;

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

    fn path(&self) -> Option<&String> {
        match self {
            XdgIcon::Path(p) => Some(p),
            _ => None,
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
        let cached_icon_pixmap = load_image_from_disk(&icon);
        Self {
            id,
            icon,
            icon_pixmap: Default::default(),
            cached_icon_pixmap,
            title: title.as_ref().to_string(),
            items: vec![],
            unread_count: 0,
            tooltip: Default::default(),
        }
    }

    /// Create with the given items
    pub fn with_items(self, items: impl IntoIterator<Item = TrayItem>) -> Self {
        Self {
            items: items.into_iter().collect::<Vec<_>>(),
            ..self
        }
    }

    fn get_icon_pixmap_with_badge(
        &self,
        img_container: Option<&imgIContainer>,
    ) -> Option<Vec<ksni::Icon>> {
        let cached_icon_pixmap = self.cached_icon_pixmap.as_ref()?;
        let linux_tray_integration = get_service::<nsIMessengerLinuxTrayIntegration>(
            c"@mozilla.org/mailnews/linux-tray-integration;1",
        )
        .or_else(|| {
            log::error!(target: "system_tray", "Unable to instantiate nsIMessengerLinuxTrayIntegration interface");
            None
        })?;
        let mut updated_img_container = GetterAddrefs::<imgIContainer>::new();

        unsafe {
            let badge_icon = decode_image_from_img_container(img_container?).ok()?;
            linux_tray_integration.MergeTrayIconBadge(
                &cached_icon_pixmap.rgba_data,
                cached_icon_pixmap.width,
                cached_icon_pixmap.height,
                &badge_icon.rgba_data,
                badge_icon.width,
                badge_icon.height,
                updated_img_container.ptr(),
            );
            let updated_img_container = updated_img_container.refptr()?;
            decode_image_from_img_container(&updated_img_container)
                .map(IconData::into_ksni_icon)
                .ok()
        }
    }

    fn should_display_badge(&self) -> bool {
        self.unread_count > 0 && self.icon_pixmap.len() > 0
    }

    pub fn update_unread_count(
        &mut self,
        count: u32,
        tooltip: String,
        img_container: Option<&imgIContainer>,
    ) {
        self.unread_count = count;
        self.tooltip = tooltip;
        self.icon_pixmap = Default::default();
        if count > 0 {
            if let Some(icon_pixmap) = self.get_icon_pixmap_with_badge(img_container) {
                self.icon_pixmap = icon_pixmap;
            } else {
                log::warn!(target: "system_tray", "Unable to get icon pixmap with badge")
            }
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
        if self.should_display_badge() {
            Default::default()
        } else {
            self.icon.to_string()
        }
    }

    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        if self.should_display_badge() {
            self.icon_pixmap.clone()
        } else {
            Default::default()
        }
    }

    fn tool_tip(&self) -> ksni::ToolTip {
        ksni::ToolTip {
            icon_name: self.icon_name().clone(),
            icon_pixmap: Default::default(),
            title: self.title.clone(),
            description: self.tooltip.clone(),
        }
    }

    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        self.items.iter().map(|i| i.into()).collect::<Vec<_>>()
    }
}
