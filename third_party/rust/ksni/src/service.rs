use std::cell::Cell;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::hash::{Hash, Hasher};
use std::rc::Rc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use dbus;
use dbus::arg::{RefArg, Variant};
use dbus::blocking::stdintf::org_freedesktop_dbus::PropertiesPropertiesChanged;
use dbus::blocking::LocalConnection;
use dbus::channel::{MatchingReceiver, Sender};
use dbus::message::SignalArgs;
use dbus::message::{MatchRule, MessageType};

use crate::dbus_ext;
use crate::dbus_interface;
use crate::dbus_interface::{
    DbusmenuItemsPropertiesUpdated, DbusmenuLayoutUpdated, StatusNotifierItemNewAttentionIcon,
    StatusNotifierItemNewIcon, StatusNotifierItemNewOverlayIcon, StatusNotifierItemNewStatus,
    StatusNotifierItemNewTitle, StatusNotifierItemNewToolTip, StatusNotifierWatcher,
};
use crate::error;
use crate::freedesktop;
use crate::menu;
use crate::tray;
use crate::{Handle, Tray};

const SNI_PATH: &str = "/StatusNotifierItem";
const MENU_PATH: &str = "/MenuBar";

static COUNTER: AtomicUsize = AtomicUsize::new(1);

/// Service of the tray
pub struct TrayService<T> {
    tray: Handle<T>,
}

impl<T: Tray + 'static> TrayService<T> {
    /// Create a new service
    pub fn new(tray: T) -> Self {
        let tray_state = crate::TrayStatus::default();
        TrayService {
            tray: Handle {
                model: Arc::new(Mutex::new(tray)),
                tray_status: tray_state.clone(),
            },
        }
    }

    #[doc(hidden)]
    #[deprecated(note = "state is renamed to handle")]
    pub fn state(&self) -> Handle<T> {
        self.tray.clone()
    }

    /// Get a handle of the tray
    pub fn handle(&self) -> Handle<T> {
        self.tray.clone()
    }

    fn service_loop(self, own_name: bool) -> Result<(), dbus::Error> {
        let mut service = self.build_processor(own_name)?;
        loop {
            match service.turn(None) {
                Err(error::Error::Stopped) => return Ok(()),
                Err(error::Error::Dbus(r)) => return Err(r),
                Ok(_) => (),
            }
        }
    }

    /// Run the service in current thread
    pub fn run(self) -> Result<(), dbus::Error> {
        self.service_loop(true)
    }

    /// Run the service in current thread, but not register new dbus name
    ///
    /// Which is required for some sandboxed environments (flatpak)
    /// https://chromium-review.googlesource.com/c/chromium/src/+/4179380
    pub fn run_without_dbus_name(self) -> Result<(), dbus::Error> {
        self.service_loop(false)
    }

    /// Run the service in a new thread
    pub fn spawn(self)
    where
        T: Send,
    {
        thread::spawn(|| self.run().unwrap());
    }

    /// Run the service in a new thread, but not register new dbus name
    ///
    /// Which is required for some sandboxed environments (flatpak)
    /// https://chromium-review.googlesource.com/c/chromium/src/+/4179380
    pub fn spawn_without_dbus_name(self)
    where
        T: Send,
    {
        thread::spawn(|| self.run_without_dbus_name().unwrap());
    }

    fn build_processor(self, own_name: bool) -> Result<Processor<T>, dbus::Error> {
        let conn = LocalConnection::new_session()?;
        let name = if own_name {
            format!(
                "org.kde.StatusNotifierItem-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::AcqRel)
            )
        } else {
            conn.unique_name().to_string()
        };

        if own_name {
            conn.request_name(&name, true, true, false)?;
        }

        let (menu_cache, prop_cache) = {
            let state = self.tray.model.lock().unwrap();
            (
                RefCell::new(menu::menu_flatten(T::menu(&*state))),
                RefCell::new(PropertiesCache::new(&*state)),
            )
        };
        let inner = Rc::new(InnerState {
            handle: self.tray,
            menu_cache,
            item_id_offset: Cell::new(0),
            revision: Cell::new(0),
            prop_cache,
        });

        let tray_service2 = inner.clone();
        let tray_service3 = inner.clone();
        let f = dbus_tree::Factory::new_fn::<()>();
        let sni_interface = dbus_interface::status_notifier_item_server(&f, (), move |_| {
            tray_service2.clone() as Rc<dyn dbus_interface::StatusNotifierItem>
        });
        let menu_interface = dbus_interface::dbusmenu_server(&f, (), move |_| {
            tray_service3.clone() as Rc<dyn dbus_interface::Dbusmenu>
        });
        let tree = f
            .tree(())
            .add(
                f.object_path(SNI_PATH, ())
                    .introspectable()
                    .add(sni_interface),
            )
            .add(
                f.object_path(MENU_PATH, ())
                    .introspectable()
                    .add(menu_interface),
            )
            // Add root path, to help introspection from debugging tools
            .add(f.object_path("/", ()).introspectable());
        let mut rule = MatchRule::new();
        rule.msg_type = Some(MessageType::MethodCall);
        conn.start_receive(
            rule,
            Box::new(move |msg, c| {
                dbus_ext::with_conn(c, || {
                    if let Some(replies) = tree.handle(&msg) {
                        for r in replies {
                            let _ = c.send(r);
                        }
                    }
                });
                true
            }),
        );

        let snw_object = conn.with_proxy(
            "org.kde.StatusNotifierWatcher",
            "/StatusNotifierWatcher",
            Duration::from_secs(1),
        );
        match snw_object.register_status_notifier_item(&name) {
            Err(ref e) if e.name() == Some("org.freedesktop.DBus.Error.ServiceUnknown") => {
                if !inner.handle.model.lock().unwrap().watcher_offine() {
                    inner.handle.tray_status.stop();
                }
            }
            Ok(()) => inner.handle.model.lock().unwrap().watcher_online(),
            r => r?,
        };

        let dbus_object = conn.with_proxy(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            Duration::from_secs(1),
        );
        let inner2 = inner.clone();
        dbus_object.match_signal(
            move |h: freedesktop::NameOwnerChanged, c: &LocalConnection, _: &dbus::Message| {
                if h.name == "org.kde.StatusNotifierWatcher" {
                    if h.new_owner.is_empty() {
                        if !inner2.handle.model.lock().unwrap().watcher_offine() {
                            inner2.handle.tray_status.stop();
                        }
                    } else {
                        if h.old_owner.is_empty() {
                            inner2.handle.model.lock().unwrap().watcher_online();
                        }
                        c.with_proxy(
                            "org.kde.StatusNotifierWatcher",
                            "/StatusNotifierWatcher",
                            Duration::from_secs(1),
                        )
                        .register_status_notifier_item(&name)
                        .unwrap_or_default();
                    }
                }
                true
            },
        )?;

        Ok(Processor { conn, state: inner })
    }
}

/// A running TrayService, !Send + !Sync
struct Processor<T> {
    conn: LocalConnection,
    state: Rc<InnerState<T>>,
}

impl<T: Tray + 'static> Processor<T> {
    fn turn(&mut self, timeout: Option<Duration>) -> Result<(), error::Error> {
        const PIECE: Duration = Duration::from_millis(50);
        let now = Instant::now();
        // Didn't find a better way to do the "select",
        // just poll
        loop {
            use crate::CurrentTrayStatus::*;
            match self.state.handle.tray_status.take() {
                NeedUpdate => {
                    dbus_ext::with_conn(&self.conn, || {
                        self.state.update_properties();
                        self.state.update_menu();
                    });
                }
                Stop => {
                    break Err(error::Error::Stopped);
                }
                Idle => {}
            }
            let wait = timeout
                .map(|timeout| std::cmp::min(PIECE, timeout - now.elapsed()))
                .unwrap_or(PIECE);
            self.conn.process(wait)?;
            if wait < PIECE {
                break Ok(());
            }
        }
    }
}

struct InnerState<T> {
    handle: Handle<T>,
    // A list of menu item and it's submenu
    menu_cache: RefCell<Vec<(menu::RawMenuItem<T>, Vec<usize>)>>,
    item_id_offset: Cell<i32>,
    revision: Cell<u32>,
    prop_cache: RefCell<PropertiesCache>,
}

impl<T: Tray + 'static> InnerState<T> {
    fn update_immediately<F: Fn(&mut T)>(&self, f: F) {
        {
            let mut model = self.handle.model.lock().unwrap();
            (f)(&mut model);
        }
        self.update_properties();
        self.update_menu();
    }

    // TODO: macro?
    fn update_properties(&self) {
        let sni_dbus_path: dbus::Path = SNI_PATH.into();
        let inner = self.handle.model.lock().unwrap();
        let mut prop_cache = self.prop_cache.borrow_mut();
        let mut dbusmenu_changed: HashMap<String, Variant<Box<dyn RefArg>>> = HashMap::new();
        let mut sni_changed: HashMap<String, Variant<Box<dyn RefArg>>> = HashMap::new();

        let mut dbus_msgs = Vec::new();

        if let Some(text_direction) = prop_cache.text_direction_changed(&*inner) {
            dbusmenu_changed.insert(
                "TextDirection".into(),
                Variant(Box::new(text_direction.to_string())),
            );
        }

        if let Some(tray_status) = prop_cache.status_changed(&*inner) {
            let msg = StatusNotifierItemNewStatus {
                status: tray_status.to_string(),
            }
            .to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
            let menu_status = match tray_status {
                tray::Status::Passive | tray::Status::Active => menu::Status::Normal,
                tray::Status::NeedsAttention => menu::Status::Notice,
            };
            dbusmenu_changed.insert("Status".into(), Variant(Box::new(menu_status.to_string())));
        }

        if let Some(icon_theme_path) = prop_cache.icon_theme_path_changed(&*inner) {
            dbusmenu_changed.insert(
                "IconThemePath".into(),
                Variant(Box::new(icon_theme_path.to_string())),
            );
            sni_changed.insert(
                "IconThemePath".into(),
                Variant(Box::new(vec![icon_theme_path.to_string()])),
            );
        }

        if !dbusmenu_changed.is_empty() {
            let msg = PropertiesPropertiesChanged {
                interface_name: "com.canonical.dbusmenu".to_owned(),
                changed_properties: dbusmenu_changed,
                invalidated_properties: Vec::new(),
            }
            .to_emit_message(&MENU_PATH.into());
            dbus_msgs.push(msg);
        }

        if let Some(category) = prop_cache.category_changed(&*inner) {
            sni_changed.insert("Category".into(), Variant(Box::new(category.to_string())));
        }

        if let Some(window_id) = prop_cache.window_id_changed(&*inner) {
            sni_changed.insert("WindowId".into(), Variant(Box::new(window_id.to_string())));
        }

        if !sni_changed.is_empty() {
            let msg = PropertiesPropertiesChanged {
                interface_name: "org.kde.StatusNotifierItem".to_owned(),
                changed_properties: sni_changed,
                invalidated_properties: Vec::new(),
            }
            .to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
        }

        // TODO: assert the id is consistent

        if prop_cache.title_changed(&*inner) {
            let msg = StatusNotifierItemNewTitle {}.to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
        }
        if prop_cache.icon_changed(&*inner) {
            let msg = StatusNotifierItemNewIcon {}.to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
        }
        if prop_cache.overlay_icon_changed(&*inner) {
            let msg = StatusNotifierItemNewOverlayIcon {}.to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
        }
        if prop_cache.attention_icon_changed(&*inner) {
            let msg = StatusNotifierItemNewAttentionIcon {}.to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
        }
        if prop_cache.tool_tip_changed(&*inner) {
            let msg = StatusNotifierItemNewToolTip {}.to_emit_message(&sni_dbus_path);
            dbus_msgs.push(msg);
        }

        dbus_ext::with_current(move |conn| {
            for msg in dbus_msgs {
                conn.send(msg).unwrap();
            }
        })
        .unwrap();
    }

    fn update_menu(&self) {
        let new_menu = menu::menu_flatten(T::menu(&*self.handle.model.lock().unwrap()));
        let mut old_menu = self.menu_cache.borrow_mut();

        let mut props_updated = DbusmenuItemsPropertiesUpdated {
            updated_props: Vec::new(),
            removed_props: Vec::new(),
        };
        let default = crate::menu::RawMenuItem::default();
        let mut layout_updated = false;
        for (index, (old, new)) in old_menu
            .iter()
            .chain(std::iter::repeat(&(default, vec![])))
            .zip(new_menu.clone().into_iter())
            .enumerate()
        {
            let (old_item, old_childs) = old;
            let (new_item, new_childs) = new;

            if let Some((updated_props, removed_props)) = old_item.diff(new_item) {
                if !updated_props.is_empty() {
                    props_updated
                        .updated_props
                        .push((self.index2id(index), updated_props));
                }
                if !removed_props.is_empty() {
                    props_updated
                        .removed_props
                        .push((self.index2id(index), removed_props));
                }
            }
            if *old_childs != new_childs {
                layout_updated = true;
                break;
            }
        }

        if layout_updated {
            // The layout has been changed, bump ID offset to invalidate all items,
            // which is required to avoid unexpected behaviors on some system tray
            self.revision.set(self.revision.get() + 1);
            self.item_id_offset
                .set(self.item_id_offset.get() + old_menu.len() as i32);
            *old_menu = new_menu;

            let msg = DbusmenuLayoutUpdated {
                parent: 0,
                revision: self.revision.get(),
            }
            .to_emit_message(&MENU_PATH.into());
            dbus_ext::with_current(move |conn| {
                conn.send(msg).unwrap();
            })
            .unwrap();
        } else if !props_updated.updated_props.is_empty() || !props_updated.removed_props.is_empty()
        {
            *old_menu = new_menu;

            let msg = props_updated.to_emit_message(&MENU_PATH.into());
            dbus_ext::with_current(move |conn| {
                conn.send(msg).unwrap();
            })
            .unwrap();
        } else {
            *old_menu = new_menu;
        }
    }

    // Return None if item not exists
    fn id2index(&self, id: i32) -> Option<usize> {
        let number_of_items = self.menu_cache.borrow().len();
        let offset = self.item_id_offset.get();
        if id == 0 && number_of_items > 0 {
            // ID of the root item is always 0
            return Some(0);
        } else if id == offset {
            // illegal id, bug in index2id or dbus peer
            return None;
        } else if id <= offset {
            // expired id
            return None;
        }
        let index: usize = (id - offset).try_into().expect("unreachable!");
        if index < number_of_items {
            Some(index)
        } else {
            None
        }
    }

    fn index2id(&self, index: usize) -> i32 {
        // ID of the root item is always 0
        if index == 0 {
            0
        } else {
            <i32 as TryFrom<_>>::try_from(index)
                .expect("index overflow")
                .checked_add(self.item_id_offset.get())
                .expect("id overflow")
        }
    }

    // Return None if parent_id not found
    fn gen_dbusmenu_tree(
        &self,
        parent_id: i32,
        recursion_depth: Option<usize>,
        property_names: Vec<&str>,
    ) -> Option<(
        i32,
        HashMap<String, Variant<Box<dyn RefArg + 'static>>>,
        Vec<Variant<Box<dyn RefArg + 'static>>>,
    )> {
        let parent_index = self.id2index(parent_id)?;

        // The type is Vec<Option<id, properties, Vec<submenu>, Vec<submenu_index>>>
        let mut x: Vec<
            Option<(
                i32,
                HashMap<String, Variant<Box<dyn RefArg>>>,
                Vec<Variant<Box<dyn RefArg>>>,
                Vec<usize>,
            )>,
        > = self
            .menu_cache
            .borrow()
            .iter()
            .enumerate()
            .map(|(index, (item, submenu))| {
                (
                    self.index2id(index),
                    item.to_dbus_map(&property_names),
                    Vec::with_capacity(submenu.len()),
                    submenu.clone(),
                )
            })
            .map(Some)
            .collect();
        let mut stack = vec![parent_index];

        while let Some(current) = stack.pop() {
            let submenu_indexes = &mut x[current].as_mut().unwrap().3;
            if submenu_indexes.is_empty() {
                let c = x[current].as_mut().unwrap();
                if !c.2.is_empty() {
                    c.1.insert(
                        "children-display".into(),
                        Variant(Box::new("submenu".to_owned())),
                    );
                }
                if let Some(parent) = stack.pop() {
                    x.push(None);
                    let item = x.swap_remove(current).unwrap();
                    stack.push(parent);
                    x[parent]
                        .as_mut()
                        .unwrap()
                        .2
                        .push(Variant(Box::new((item.0, item.1, item.2))));
                }
            } else {
                stack.push(current);
                let sub = submenu_indexes.remove(0);
                if recursion_depth.is_none() || recursion_depth.unwrap() + 1 >= stack.len() {
                    stack.push(sub);
                }
            }
        }

        let resp = x.remove(parent_index).unwrap();
        Some((resp.0, resp.1, resp.2))
    }
}

impl<T: Tray> fmt::Debug for InnerState<T> {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        f.debug_struct(&format!("StatusNotifierItem")).finish()
    }
}

impl<T: Tray + 'static> dbus_interface::StatusNotifierItem for InnerState<T> {
    fn activate(&self, x: i32, y: i32) -> Result<(), dbus::MethodErr> {
        self.update_immediately(|model| {
            Tray::activate(model, x, y);
        });
        Ok(())
    }

    fn secondary_activate(&self, x: i32, y: i32) -> Result<(), dbus::MethodErr> {
        self.update_immediately(|model| {
            Tray::secondary_activate(&mut *model, x, y);
        });
        Ok(())
    }

    fn scroll(&self, delta: i32, dir: &str) -> Result<(), dbus::MethodErr> {
        self.update_immediately(|model| {
            Tray::scroll(&mut *model, delta, dir);
        });
        Ok(())
    }

    fn context_menu(&self, _x: i32, _y: i32) -> Result<(), dbus::MethodErr> {
        Ok(())
    }

    fn item_is_menu(&self) -> Result<bool, dbus::MethodErr> {
        Ok(false)
    }

    fn category(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::category(&*model).to_string())
    }

    fn id(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::id(&*model))
    }

    fn title(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::title(&*model))
    }

    fn status(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::status(&*model).to_string())
    }

    fn window_id(&self) -> Result<i32, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::window_id(&*model))
    }

    fn menu(&self) -> Result<dbus::Path<'static>, dbus::MethodErr> {
        Ok(MENU_PATH.into())
    }

    fn icon_name(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::icon_name(&*model))
    }

    fn icon_theme_path(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::icon_theme_path(&*model))
    }

    fn icon_pixmap(&self) -> Result<Vec<(i32, i32, Vec<u8>)>, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::icon_pixmap(&*model)
            .into_iter()
            .map(Into::into)
            .collect())
    }

    fn overlay_icon_name(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::overlay_icon_name(&*model))
    }

    fn overlay_icon_pixmap(&self) -> Result<Vec<(i32, i32, Vec<u8>)>, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::overlay_icon_pixmap(&*model)
            .into_iter()
            .map(Into::into)
            .collect())
    }

    fn attention_icon_name(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::attention_icon_name(&*model))
    }

    fn attention_icon_pixmap(&self) -> Result<Vec<(i32, i32, Vec<u8>)>, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::attention_icon_pixmap(&*model)
            .into_iter()
            .map(Into::into)
            .collect())
    }

    fn attention_movie_name(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::attention_movie_name(&*model))
    }

    fn tool_tip(
        &self,
    ) -> Result<(String, Vec<(i32, i32, Vec<u8>)>, String, String), dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::tool_tip(&*model).into())
    }
}

impl<T: Tray + 'static> dbus_interface::Dbusmenu for InnerState<T> {
    fn get_layout(
        &self,
        parent_id: i32,
        recursion_depth: i32,
        property_names: Vec<&str>,
    ) -> Result<
        (
            u32,
            (
                i32,
                HashMap<String, Variant<Box<dyn RefArg + 'static>>>,
                Vec<Variant<Box<dyn RefArg + 'static>>>,
            ),
        ),
        dbus::MethodErr,
    > {
        if let Some(menu_tree) = self.gen_dbusmenu_tree(
            parent_id,
            if recursion_depth < 0 {
                None
            } else {
                Some(recursion_depth as usize)
            },
            property_names,
        ) {
            Ok((self.revision.get(), menu_tree))
        } else {
            Err(dbus::Error::new_failed("parentId not found").into())
        }
    }

    fn get_group_properties(
        &self,
        ids: Vec<i32>,
        property_names: Vec<&str>,
    ) -> Result<Vec<(i32, HashMap<String, Variant<Box<dyn RefArg + 'static>>>)>, dbus::MethodErr>
    {
        let r = ids
            .into_iter()
            .filter_map(|id| self.id2index(id).map(|index| (id, index)))
            .map(|(id, index)| {
                (
                    id,
                    self.menu_cache.borrow()[index]
                        .0
                        .to_dbus_map(&property_names),
                )
            })
            .collect();
        Ok(r)
    }

    fn get_property(
        &self,
        id: i32,
        name: &str,
    ) -> Result<Variant<Box<dyn RefArg + 'static>>, dbus::MethodErr> {
        let index = self
            .id2index(id)
            .ok_or_else(|| dbus::Error::new_failed("id not found"))?;
        let mut props = self.menu_cache.borrow()[index].0.to_dbus_map(&[name]);
        Ok(props.remove(name).unwrap())
    }

    fn event(
        &self,
        id: i32,
        event_id: &str,
        _data: Variant<Box<dyn RefArg>>,
        _timestamp: u32,
    ) -> Result<(), dbus::MethodErr> {
        match event_id {
            "clicked" => {
                assert_ne!(id, 0, "ROOT MENU ITEM CLICKED");
                let index = self
                    .id2index(id)
                    .ok_or_else(|| dbus::Error::new_failed("id not found"))?;
                let activate = self.menu_cache.borrow()[index].0.on_clicked.clone();
                self.update_immediately(|model| {
                    (activate)(model, index);
                });
            }
            _ => (),
        }
        Ok(())
    }

    fn event_group(
        &self,
        events: Vec<(i32, &str, Variant<Box<dyn RefArg>>, u32)>,
    ) -> Result<Vec<i32>, dbus::MethodErr> {
        let (found, not_found) = events
            .into_iter()
            .partition::<Vec<_>, _>(|event| self.id2index(event.0).is_some());
        if found.is_empty() {
            return Err(
                dbus::Error::new_failed("None of the id in the events can be found").into(),
            );
        }
        for (id, event_id, data, timestamp) in found {
            self.event(id, event_id, data, timestamp)?;
        }
        Ok(not_found.into_iter().map(|event| event.0).collect())
    }

    fn about_to_show(&self, _id: i32) -> Result<bool, dbus::MethodErr> {
        Ok(false)
    }

    fn about_to_show_group(&self, _ids: Vec<i32>) -> Result<(Vec<i32>, Vec<i32>), dbus::MethodErr> {
        // FIXME: the DBus message should set the no reply flag
        Ok(Default::default())
    }

    fn version(&self) -> Result<u32, dbus::MethodErr> {
        Ok(3)
    }

    fn text_direction(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(Tray::text_direction(&*model).to_string())
    }

    fn status(&self) -> Result<String, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        Ok(match Tray::status(&*model) {
            tray::Status::Active | tray::Status::Passive => menu::Status::Normal,
            tray::Status::NeedsAttention => menu::Status::Notice,
        }
        .to_string())
    }

    fn icon_theme_path(&self) -> Result<Vec<String>, dbus::MethodErr> {
        let model = self.handle.model.lock().unwrap();
        let path = Tray::icon_theme_path(&*model);
        Ok(if path.is_empty() {
            Default::default()
        } else {
            vec![path]
        })
    }
}

struct PropertiesCache {
    category: crate::Category,
    title: u64,
    status: crate::Status,
    window_id: i32,
    icon_theme_path: u64,
    icon: u64,
    overlay_icon: u64,
    attention_icon: u64,
    tool_tip: u64,
    text_direction: crate::TextDirection,
}

impl PropertiesCache {
    fn new<T: Tray>(tray: &T) -> Self {
        PropertiesCache {
            category: tray.category(),
            title: hash_of(tray.title()),
            status: tray.status(),
            window_id: tray.window_id(),
            icon_theme_path: hash_of(tray.icon_theme_path()),
            icon: hash_of((tray.icon_name(), tray.icon_pixmap())),
            overlay_icon: hash_of((tray.overlay_icon_name(), tray.overlay_icon_pixmap())),
            attention_icon: hash_of((
                tray.attention_icon_name(),
                tray.attention_icon_pixmap(),
                tray.attention_movie_name(),
            )),
            tool_tip: hash_of(tray.tool_tip()),
            text_direction: tray.text_direction(),
        }
    }

    fn category_changed<T: Tray>(&mut self, t: &T) -> Option<crate::Category> {
        let v = t.category();
        if self.category != v {
            self.category = v;
            Some(v)
        } else {
            None
        }
    }

    fn title_changed<T: Tray>(&mut self, t: &T) -> bool {
        let hash = hash_of(t.title());
        self.title != hash && {
            self.title = hash;
            true
        }
    }

    fn status_changed<T: Tray>(&mut self, t: &T) -> Option<crate::Status> {
        let v = t.status();
        if self.status != v {
            self.status = v;
            Some(v)
        } else {
            None
        }
    }

    fn window_id_changed<T: Tray>(&mut self, t: &T) -> Option<i32> {
        let v = t.window_id();
        if self.window_id != v {
            self.window_id = v;
            Some(v)
        } else {
            None
        }
    }

    fn icon_theme_path_changed<T: Tray>(&mut self, t: &T) -> Option<String> {
        let v = t.icon_theme_path();
        let hash = hash_of(&v);
        if self.icon_theme_path != hash {
            self.icon_theme_path = hash;
            Some(v)
        } else {
            None
        }
    }

    fn icon_changed<T: Tray>(&mut self, tray: &T) -> bool {
        let hash = hash_of((tray.icon_name(), tray.icon_pixmap()));
        self.icon != hash && {
            self.icon = hash;
            true
        }
    }

    fn overlay_icon_changed<T: Tray>(&mut self, tray: &T) -> bool {
        let hash = hash_of((tray.overlay_icon_name(), tray.overlay_icon_pixmap()));
        self.overlay_icon != hash && {
            self.overlay_icon = hash;
            true
        }
    }

    fn attention_icon_changed<T: Tray>(&mut self, tray: &T) -> bool {
        let hash = hash_of((
            tray.attention_icon_name(),
            tray.attention_icon_pixmap(),
            tray.attention_movie_name(),
        ));
        self.attention_icon != hash && {
            self.attention_icon = hash;
            true
        }
    }

    fn tool_tip_changed<T: Tray>(&mut self, tray: &T) -> bool {
        let hash = hash_of(tray.tool_tip());
        self.tool_tip != hash && {
            self.tool_tip = hash;
            true
        }
    }

    fn text_direction_changed<T: Tray>(&mut self, t: &T) -> Option<crate::TextDirection> {
        let v = t.text_direction();
        if self.text_direction != v {
            self.text_direction = v;
            Some(v)
        } else {
            None
        }
    }
}

fn hash_of<T: Hash>(v: T) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    let mut hasher = DefaultHasher::new();
    v.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::*;

    /// gen_dbusmenu_tree should not return an empty tree when menu_cache is empty,
    /// which was the old behavior before 421a8d9e5ac46f58ce13543df94ce3c9d85c7be2
    #[test]
    fn gen_dbusmenu_tree_empty() {
        impl Tray for () {}
        let handle = Handle {
            tray_status: TrayStatus::default(),
            model: Arc::new(Mutex::new(())),
        };
        let state = InnerState {
            handle,
            menu_cache: RefCell::new(Vec::new()),
            item_id_offset: Cell::new(0),
            revision: Cell::new(0),
            prop_cache: RefCell::new(PropertiesCache::new(&())),
        };
        let r = state.gen_dbusmenu_tree(0, None, Vec::new());
        assert!(r.is_none());
        let r = state.gen_dbusmenu_tree(1, None, Vec::new());
        assert!(r.is_none());
    }
}
