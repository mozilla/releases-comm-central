//! Types used to construct a menu

use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;

use dbus::arg::{RefArg, Variant};

// pub struct Properties {
//     /// Tells if the menus are in a normal state or they believe that they
//     /// could use some attention.  Cases for showing them would be if help
//     /// were referring to them or they accessors were being highlighted.
//     /// This property can have two values: "normal" in almost all cases and
//     /// "notice" when they should have a higher priority to be shown.
//     pub status: Status,
//     /// A list of directories that should be used for finding icons using
//     /// the icon naming spec.  Idealy there should only be one for the icon
//     /// theme, but additional ones are often added by applications for
//     /// app specific icons.
//     pub icon_theme_path: Vec<String>,
// }

/// Direction of texts
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TextDirection {
    LeftToRight,
    RightToLeft,
}

impl fmt::Display for TextDirection {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        let r = match *self {
            TextDirection::LeftToRight => "ltr",
            TextDirection::RightToLeft => "rtl",
        };
        f.write_str(r)
    }
}

pub(crate) enum Status {
    Normal,
    Notice,
}

impl fmt::Display for Status {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        let r = match *self {
            Status::Normal => "normal",
            Status::Notice => "notice",
        };
        f.write_str(r)
    }
}

/// All types of menu item
///
/// Do not use directly (except [`MenuItem::Separator`]), see examples in top level documents
pub enum MenuItem<T> {
    Standard(StandardItem<T>),
    /// A separator
    Separator,
    Checkmark(CheckmarkItem<T>),
    SubMenu(SubMenu<T>),
    RadioGroup(RadioGroup<T>),
}

/// Menu item, the standard one
pub struct StandardItem<T> {
    /// Text of the item, except that:
    /// -# two consecutive underscore characters "__" are displayed as a
    /// single underscore,
    /// -# any remaining underscore characters are not displayed at all,
    /// -# the first of those remaining underscore characters (unless it is
    /// the last character in the string) indicates that the following
    /// character is the access key.
    pub label: String,
    /// Whether the item can be activated or not.
    pub enabled: bool,
    /// True if the item is visible in the menu.
    pub visible: bool,
    /// Icon name of the item, following the freedesktop.org icon spec.
    pub icon_name: String,
    /// PNG data of the icon.
    pub icon_data: Vec<u8>,
    /// The shortcut of the item. Each array represents the key press
    /// in the list of keypresses. Each list of strings contains a list of
    /// modifiers and then the key that is used. The modifier strings
    /// allowed are: "Control", "Alt", "Shift" and "Super".
    /// - A simple shortcut like Ctrl+S is represented as:
    ///   [["Control", "S"]]
    /// - A complex shortcut like Ctrl+Q, Alt+X is represented as:
    ///   [["Control", "Q"], ["Alt", "X"]]
    pub shortcut: Vec<Vec<String>>,
    /// How the menuitem feels the information it's displaying to the
    /// user should be presented.
    pub disposition: Disposition,
    pub activate: Box<dyn Fn(&mut T)>,
}

impl<T> Default for StandardItem<T> {
    fn default() -> Self {
        StandardItem {
            label: String::default(),
            enabled: true,
            visible: true,
            icon_name: String::default(),
            icon_data: Vec::default(),
            shortcut: Vec::default(),
            disposition: Disposition::Normal,
            activate: Box::new(|_this| {}),
        }
    }
}

impl<T> From<StandardItem<T>> for MenuItem<T> {
    fn from(item: StandardItem<T>) -> Self {
        MenuItem::Standard(item)
    }
}

impl<T: 'static> From<StandardItem<T>> for RawMenuItem<T> {
    fn from(item: StandardItem<T>) -> Self {
        let activate = item.activate;
        Self {
            r#type: ItemType::Standard,
            label: item.label,
            enabled: item.enabled,
            visible: item.visible,
            icon_name: item.icon_name,
            icon_data: item.icon_data,
            shortcut: item.shortcut,
            disposition: item.disposition,
            on_clicked: Rc::new(move |this, _id| {
                (activate)(this);
            }),
            ..Default::default()
        }
    }
}

/// Menu item, a container of another menu tree
pub struct SubMenu<T> {
    /// Text of the item, except that:
    /// -# two consecutive underscore characters "__" are displayed as a
    /// single underscore,
    /// -# any remaining underscore characters are not displayed at all,
    /// -# the first of those remaining underscore characters (unless it is
    /// the last character in the string) indicates that the following
    /// character is the access key.
    pub label: String,
    /// Whether the item can be activated or not.
    pub enabled: bool,
    /// True if the item is visible in the menu.
    pub visible: bool,
    /// Icon name of the item, following the freedesktop.org icon spec.
    pub icon_name: String,
    /// PNG data of the icon.
    pub icon_data: Vec<u8>,
    /// The shortcut of the item. Each array represents the key press
    /// in the list of keypresses. Each list of strings contains a list of
    /// modifiers and then the key that is used. The modifier strings
    /// allowed are: "Control", "Alt", "Shift" and "Super".
    /// - A simple shortcut like Ctrl+S is represented as:
    ///   [["Control", "S"]]
    /// - A complex shortcut like Ctrl+Q, Alt+X is represented as:
    ///   [["Control", "Q"], ["Alt", "X"]]
    pub shortcut: Vec<Vec<String>>,
    /// How the menuitem feels the information it's displaying to the
    /// user should be presented.
    pub disposition: Disposition,
    pub submenu: Vec<MenuItem<T>>,
}

impl<T> Default for SubMenu<T> {
    fn default() -> Self {
        Self {
            label: String::default(),
            enabled: true,
            visible: true,
            icon_name: String::default(),
            icon_data: Vec::default(),
            shortcut: Vec::default(),
            disposition: Disposition::Normal,
            submenu: Vec::default(),
        }
    }
}

impl<T> From<SubMenu<T>> for MenuItem<T> {
    fn from(item: SubMenu<T>) -> Self {
        MenuItem::SubMenu(item)
    }
}

impl<T> From<SubMenu<T>> for RawMenuItem<T> {
    fn from(item: SubMenu<T>) -> Self {
        Self {
            r#type: ItemType::Standard,
            label: item.label,
            enabled: item.enabled,
            visible: item.visible,
            icon_name: item.icon_name,
            icon_data: item.icon_data,
            shortcut: item.shortcut,
            disposition: item.disposition,
            on_clicked: Rc::new(move |_this, _id| Default::default()),
            ..Default::default()
        }
    }
}

/// Menu item, checkable
pub struct CheckmarkItem<T> {
    /// Text of the item, except that:
    /// -# two consecutive underscore characters "__" are displayed as a
    /// single underscore,
    /// -# any remaining underscore characters are not displayed at all,
    /// -# the first of those remaining underscore characters (unless it is
    /// the last character in the string) indicates that the following
    /// character is the access key.
    pub label: String,
    /// Whether the item can be activated or not.
    pub enabled: bool,
    /// True if the item is visible in the menu.
    pub visible: bool,
    pub checked: bool,
    /// PNG data of the icon.
    pub icon_name: String,
    /// PNG data of the icon.
    pub icon_data: Vec<u8>,
    /// The shortcut of the item. Each array represents the key press
    /// in the list of keypresses. Each list of strings contains a list of
    /// modifiers and then the key that is used. The modifier strings
    /// allowed are: "Control", "Alt", "Shift" and "Super".
    /// - A simple shortcut like Ctrl+S is represented as:
    ///   [["Control", "S"]]
    /// - A complex shortcut like Ctrl+Q, Alt+X is represented as:
    ///   [["Control", "Q"], ["Alt", "X"]]
    pub shortcut: Vec<Vec<String>>,
    /// How the menuitem feels the information it's displaying to the
    /// user should be presented.
    pub disposition: Disposition,
    pub activate: Box<dyn Fn(&mut T)>,
}

impl<T> Default for CheckmarkItem<T> {
    fn default() -> Self {
        CheckmarkItem {
            label: String::default(),
            enabled: true,
            visible: true,
            checked: false,
            icon_name: String::default(),
            icon_data: Vec::default(),
            shortcut: Vec::default(),
            disposition: Disposition::Normal,
            activate: Box::new(|_this| {}),
        }
    }
}

impl<T> From<CheckmarkItem<T>> for MenuItem<T> {
    fn from(item: CheckmarkItem<T>) -> Self {
        MenuItem::Checkmark(item)
    }
}

impl<T: 'static> From<CheckmarkItem<T>> for RawMenuItem<T> {
    fn from(item: CheckmarkItem<T>) -> Self {
        let activate = item.activate;
        Self {
            r#type: ItemType::Standard,
            label: item.label,
            enabled: item.enabled,
            visible: item.visible,
            icon_name: item.icon_name,
            icon_data: item.icon_data,
            shortcut: item.shortcut,
            toggle_type: ToggleType::Checkmark,
            toggle_state: if item.checked {
                ToggleState::On
            } else {
                ToggleState::Off
            },
            disposition: item.disposition,
            on_clicked: Rc::new(move |this, _id| {
                (activate)(this);
            }),
            ..Default::default()
        }
    }
}

/// Menu item, contains [`RadioItem`]
pub struct RadioGroup<T> {
    pub selected: usize,
    pub select: Box<dyn Fn(&mut T, usize)>,
    pub options: Vec<RadioItem>,
}

impl<T> Default for RadioGroup<T> {
    fn default() -> Self {
        Self {
            selected: 0,
            select: Box::new(|_, _| {}),
            options: Default::default(),
        }
    }
}

impl<T> From<RadioGroup<T>> for MenuItem<T> {
    fn from(item: RadioGroup<T>) -> Self {
        MenuItem::RadioGroup(item)
    }
}

/// Items of [`RadioGroup`]
pub struct RadioItem {
    /// Text of the item, except that:
    /// -# two consecutive underscore characters "__" are displayed as a
    /// single underscore,
    /// -# any remaining underscore characters are not displayed at all,
    /// -# the first of those remaining underscore characters (unless it is
    /// the last character in the string) indicates that the following
    /// character is the access key.
    pub label: String,
    /// Whether the item can be activated or not.
    pub enabled: bool,
    /// True if the item is visible in the menu.
    pub visible: bool,
    /// Icon name of the item, following the freedesktop.org icon spec.
    pub icon_name: String,
    /// PNG data of the icon.
    pub icon_data: Vec<u8>,
    /// The shortcut of the item. Each array represents the key press
    /// in the list of keypresses. Each list of strings contains a list of
    /// modifiers and then the key that is used. The modifier strings
    /// allowed are: "Control", "Alt", "Shift" and "Super".
    /// - A simple shortcut like Ctrl+S is represented as:
    ///   [["Control", "S"]]
    /// - A complex shortcut like Ctrl+Q, Alt+X is represented as:
    ///   [["Control", "Q"], ["Alt", "X"]]
    pub shortcut: Vec<Vec<String>>,
    /// How the menuitem feels the information it's displaying to the
    /// user should be presented.
    pub disposition: Disposition,
}

impl Default for RadioItem {
    fn default() -> Self {
        Self {
            label: String::default(),
            enabled: true,
            visible: true,
            icon_name: String::default(),
            icon_data: Vec::default(),
            shortcut: Vec::default(),
            disposition: Disposition::Normal,
        }
    }
}

pub(crate) struct RawMenuItem<T> {
    r#type: ItemType,
    /// Text of the item, except that:
    /// -# two consecutive underscore characters "__" are displayed as a
    /// single underscore,
    /// -# any remaining underscore characters are not displayed at all,
    /// -# the first of those remaining underscore characters (unless it is
    /// the last character in the string) indicates that the following
    /// character is the access key.
    label: String,
    /// Whether the item can be activated or not.
    enabled: bool,
    /// True if the item is visible in the menu.
    visible: bool,
    /// Icon name of the item, following the freedesktop.org icon spec.
    icon_name: String,
    /// PNG data of the icon.
    icon_data: Vec<u8>,
    /// The shortcut of the item. Each array represents the key press
    /// in the list of keypresses. Each list of strings contains a list of
    /// modifiers and then the key that is used. The modifier strings
    /// allowed are: "Control", "Alt", "Shift" and "Super".
    /// - A simple shortcut like Ctrl+S is represented as:
    ///   [["Control", "S"]]
    /// - A complex shortcut like Ctrl+Q, Alt+X is represented as:
    ///   [["Control", "Q"], ["Alt", "X"]]
    shortcut: Vec<Vec<String>>,
    toggle_type: ToggleType,
    /// Describe the current state of a "togglable" item.
    /// Note:
    /// The implementation does not itself handle ensuring that only one
    /// item in a radio group is set to "on", or that a group does not have
    /// "on" and "indeterminate" items simultaneously; maintaining this
    /// policy is up to the toolkit wrappers.
    toggle_state: ToggleState,
    /// How the menuitem feels the information it's displaying to the
    /// user should be presented.
    disposition: Disposition,
    pub on_clicked: Rc<dyn Fn(&mut T, usize)>,
    vendor_properties: HashMap<VendorSpecific, Variant<Box<dyn RefArg + 'static>>>,
}

impl<T> Clone for RawMenuItem<T> {
    fn clone(&self) -> Self {
        let vendor_properties = self
            .vendor_properties
            .iter()
            .map(|(k, v)| (k.clone(), Variant(v.0.box_clone())))
            .collect();

        RawMenuItem {
            r#type: self.r#type.clone(),
            label: self.label.clone(),
            enabled: self.enabled,
            visible: self.visible,
            icon_name: self.icon_name.clone(),
            icon_data: self.icon_data.clone(),
            shortcut: self.shortcut.clone(),
            toggle_type: self.toggle_type,
            toggle_state: self.toggle_state,
            disposition: self.disposition,
            on_clicked: self.on_clicked.clone(),
            vendor_properties,
        }
    }
}

macro_rules! if_not_default_then_insert {
    ($map: ident, $item: ident, $default: ident, $filter: ident, $property: ident) => {
        if_not_default_then_insert!($map, $item, $default, $filter, $property, (|r| r));
    };
    ($map: ident, $item: ident, $default: ident, $filter: ident, $property: ident, $to_refarg: tt) => {{
        let name = stringify!($property).replace('_', "-");
        if_not_default_then_insert!($map, $item, $default, $filter, $property, name, $to_refarg);
    }};
    ($map: ident, $item: ident, $default: ident, $filter: ident, $property: ident, $property_name: tt, $to_refarg: tt) => {
        if ($filter.is_empty() || $filter.contains(&&*$property_name))
            && $item.$property != $default.$property
        {
            $map.insert(
                $property_name.to_string(),
                Variant(Box::new($to_refarg($item.$property))),
            );
        }
    };
}

impl<T> fmt::Debug for RawMenuItem<T> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Item {}", self.label)
    }
}

impl<T> RawMenuItem<T> {
    pub(crate) fn to_dbus_map(
        &self,
        filter: &[&str],
    ) -> HashMap<String, Variant<Box<dyn RefArg + 'static>>> {
        let item = self.clone();
        let mut properties: HashMap<String, Variant<Box<dyn RefArg + 'static>>> =
            HashMap::with_capacity(11);

        let default: RawMenuItem<T> = RawMenuItem::default();
        if_not_default_then_insert!(
            properties,
            item,
            default,
            filter,
            r#type,
            "type",
            (|r: ItemType| r.to_string())
        );
        if_not_default_then_insert!(properties, item, default, filter, label);
        if_not_default_then_insert!(properties, item, default, filter, enabled);
        if_not_default_then_insert!(properties, item, default, filter, visible);
        if_not_default_then_insert!(properties, item, default, filter, icon_name);
        if_not_default_then_insert!(properties, item, default, filter, icon_data);
        if_not_default_then_insert!(properties, item, default, filter, shortcut);
        if_not_default_then_insert!(
            properties,
            item,
            default,
            filter,
            toggle_type,
            (|r: ToggleType| r.to_string())
        );
        if_not_default_then_insert!(
            properties,
            item,
            default,
            filter,
            toggle_state,
            (|r| r as i32)
        );
        if_not_default_then_insert!(
            properties,
            item,
            default,
            filter,
            disposition,
            (|r: Disposition| r.to_string())
        );

        for (k, v) in item.vendor_properties {
            properties.insert(k.to_string(), v);
        }

        properties
    }

    pub(crate) fn diff(
        &self,
        other: Self,
    ) -> Option<(HashMap<String, Variant<Box<dyn RefArg>>>, Vec<String>)> {
        let default = Self::default();
        let mut updated_props: HashMap<String, Variant<Box<dyn RefArg>>> = HashMap::new();
        let mut removed_props = Vec::new();
        if self.r#type != other.r#type {
            if other.r#type == default.r#type {
                removed_props.push("type".into());
            } else {
                updated_props.insert("type".into(), Variant(Box::new(other.r#type.to_string())));
            }
        }
        if self.label != other.label {
            if other.label == default.label {
                removed_props.push("label".into());
            } else {
                updated_props.insert("label".into(), Variant(Box::new(other.label)));
            }
        }
        if self.enabled != other.enabled {
            if other.enabled == default.enabled {
                removed_props.push("enabled".into());
            } else {
                updated_props.insert("enabled".into(), Variant(Box::new(other.enabled)));
            }
        }
        if self.visible != other.visible {
            if other.visible == default.visible {
                removed_props.push("visible".into());
            } else {
                updated_props.insert("visible".into(), Variant(Box::new(other.visible)));
            }
        }
        if self.icon_name != other.icon_name {
            if other.icon_name == default.icon_name {
                removed_props.push("icon-name".into());
            } else {
                updated_props.insert("icon-name".into(), Variant(Box::new(other.icon_name)));
            }
        }
        if self.icon_data != other.icon_data {
            if other.icon_data == default.icon_data {
                removed_props.push("icon-data".into());
            } else {
                updated_props.insert("icon-data".into(), Variant(Box::new(other.icon_data)));
            }
        }
        if self.shortcut != other.shortcut {
            if other.shortcut == default.shortcut {
                removed_props.push("shortcut".into());
            } else {
                updated_props.insert("shortcut".into(), Variant(Box::new(other.shortcut)));
            }
        }
        if self.toggle_type != other.toggle_type {
            if other.toggle_type == default.toggle_type {
                removed_props.push("toggle-type".into());
            } else {
                updated_props.insert(
                    "toggle-type".into(),
                    Variant(Box::new(other.toggle_type.to_string())),
                );
            }
        }
        if self.toggle_state != other.toggle_state {
            if other.toggle_state == default.toggle_state {
                removed_props.push("toggle-state".into());
            } else {
                updated_props.insert(
                    "toggle-state".into(),
                    Variant(Box::new(other.toggle_state as i32)),
                );
            }
        }
        if self.disposition != other.disposition {
            if other.disposition == default.disposition {
                removed_props.push("disposition".into());
            } else {
                updated_props.insert(
                    "disposition".into(),
                    Variant(Box::new(other.disposition.to_string())),
                );
            }
        }
        // TODO: vendor_properties
        if updated_props.is_empty() && removed_props.is_empty() {
            None
        } else {
            Some((updated_props, removed_props))
        }
    }
}

impl<T> Default for RawMenuItem<T> {
    fn default() -> Self {
        RawMenuItem {
            r#type: ItemType::Standard,
            label: String::default(),
            enabled: true,
            visible: true,
            icon_name: String::default(),
            icon_data: Vec::default(),
            shortcut: Vec::default(),
            toggle_type: ToggleType::Null,
            toggle_state: ToggleState::Indeterminate,
            disposition: Disposition::Normal,
            //submenu: Vec::default(),
            on_clicked: Rc::new(|_this, _id| Default::default()),
            vendor_properties: HashMap::default(),
        }
    }
}

/// Vendor specific types/properties
/// will be formatted to "x-<vendor>-<name>""
#[doc(hidden)]
#[derive(Debug, Hash, Eq, PartialEq, Clone)]
pub struct VendorSpecific {
    pub vendor: String,
    pub name: String,
}

impl fmt::Display for VendorSpecific {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        write!(f, "x-{}-{}", self.vendor, self.name)
    }
}

#[allow(dead_code)]
#[derive(Debug, Eq, PartialEq, Clone)]
enum ItemType {
    /// An item which can be clicked to trigger an action or show another menu
    Standard,
    /// A separator
    Separator,
    /// Vendor specific types
    Vendor(VendorSpecific),
}

impl fmt::Display for ItemType {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        use ItemType::*;
        match self {
            Standard => f.write_str("standard"),
            Separator => f.write_str("separator"),
            Vendor(vendor) => vendor.fmt(f),
        }
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum ToggleType {
    /// Item is an independent togglable item
    Checkmark,
    /// Item is part of a group where only one item can be toggled at a time
    Radio,
    /// Item cannot be toggled
    Null,
}

impl fmt::Display for ToggleType {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        use ToggleType::*;
        let r = match self {
            Checkmark => "checkmark",
            Radio => "radio",
            Null => "",
        };
        f.write_str(r)
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum ToggleState {
    Off = 0,
    On = 1,
    Indeterminate = -1,
}

/// Item disposition
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum Disposition {
    /// A standard menu item
    Normal,
    /// Providing additional information to the user
    Informative,
    /// Looking at potentially harmful results
    Warning,
    /// Something bad could potentially happen
    Alert,
}

impl fmt::Display for Disposition {
    fn fmt(&self, f: &mut fmt::Formatter) -> Result<(), fmt::Error> {
        use Disposition::*;
        let r = match self {
            Normal => "normal",
            Informative => "informative",
            Warning => "warning",
            Alert => "alert",
        };
        f.write_str(r)
    }
}

pub(crate) fn menu_flatten<T: 'static>(
    items: Vec<MenuItem<T>>,
) -> Vec<(RawMenuItem<T>, Vec<usize>)> {
    let mut list: Vec<(RawMenuItem<T>, Vec<usize>)> =
        vec![(RawMenuItem::default(), Vec::with_capacity(items.len()))];

    let mut stack = vec![(items, 0)]; // (menu, menu's parent)

    while let Some((mut current_menu, parent_index)) = stack.pop() {
        while !current_menu.is_empty() {
            match current_menu.remove(0) {
                MenuItem::Standard(item) => {
                    let index = list.len();
                    list.push((item.into(), Vec::new()));
                    // Add self to parent's submenu
                    list[parent_index].1.push(index);
                }
                MenuItem::Separator => {
                    let item = RawMenuItem {
                        r#type: ItemType::Separator,
                        ..Default::default()
                    };
                    let index = list.len();
                    list.push((item, Vec::new()));
                    list[parent_index].1.push(index);
                }
                MenuItem::Checkmark(item) => {
                    let index = list.len();
                    list.push((item.into(), Vec::new()));
                    list[parent_index].1.push(index);
                }
                MenuItem::SubMenu(mut item) => {
                    let submenu = std::mem::replace(&mut item.submenu, Default::default());
                    let index = list.len();
                    list.push((item.into(), Vec::with_capacity(submenu.len())));
                    list[parent_index].1.push(index);
                    if !submenu.is_empty() {
                        stack.push((current_menu, parent_index));
                        stack.push((submenu, index));
                        break;
                    }
                }
                MenuItem::RadioGroup(group) => {
                    let offset = list.len();
                    let on_selected = Rc::new(group.select);
                    for (idx, option) in group.options.into_iter().enumerate() {
                        let on_selected = on_selected.clone();
                        let item = RawMenuItem {
                            r#type: ItemType::Standard,
                            label: option.label,
                            enabled: option.enabled,
                            visible: option.visible,
                            icon_name: option.icon_name,
                            icon_data: option.icon_data,
                            shortcut: option.shortcut,
                            toggle_type: ToggleType::Radio,
                            toggle_state: if idx == group.selected {
                                ToggleState::On
                            } else {
                                ToggleState::Off
                            },
                            disposition: option.disposition,
                            on_clicked: Rc::new(move |this, id| {
                                (on_selected)(this, id - offset);
                            }),
                            ..Default::default()
                        };
                        let index = list.len();
                        list.push((item, Vec::new()));
                        list[parent_index].1.push(index);
                    }
                }
            }
        }
    }

    list
}

#[cfg(test)]
mod test {
    use super::*;
    #[test]
    fn test_menu_flatten() {
        let x: Vec<MenuItem<()>> = vec![
            SubMenu {
                label: "a".into(),
                submenu: vec![
                    SubMenu {
                        label: "a1".into(),
                        submenu: vec![StandardItem {
                            label: "a1.1".into(),
                            ..Default::default()
                        }
                        .into()],
                        ..Default::default()
                    }
                    .into(),
                    StandardItem {
                        label: "a2".into(),
                        ..Default::default()
                    }
                    .into(),
                ],
                ..Default::default()
            }
            .into(),
            StandardItem {
                label: "b".into(),
                ..Default::default()
            }
            .into(),
            SubMenu {
                label: "c".into(),
                submenu: vec![
                    StandardItem {
                        label: "c1".into(),
                        ..Default::default()
                    }
                    .into(),
                    SubMenu {
                        label: "c2".into(),
                        submenu: vec![StandardItem {
                            label: "c2.1".into(),
                            ..Default::default()
                        }
                        .into()],
                        ..Default::default()
                    }
                    .into(),
                ],
                ..Default::default()
            }
            .into(),
        ];

        let r = menu_flatten(x);
        let expect: Vec<(RawMenuItem<()>, Vec<usize>)> = vec![
            (
                RawMenuItem {
                    label: "".into(),
                    ..Default::default()
                },
                vec![1, 5, 6],
            ),
            (
                RawMenuItem {
                    label: "a".into(),
                    ..Default::default()
                },
                vec![2, 4],
            ),
            (
                RawMenuItem {
                    label: "a1".into(),
                    ..Default::default()
                },
                vec![3],
            ),
            (
                RawMenuItem {
                    label: "a1.1".into(),
                    ..Default::default()
                },
                vec![],
            ),
            (
                RawMenuItem {
                    label: "a2".into(),
                    ..Default::default()
                },
                vec![],
            ),
            (
                RawMenuItem {
                    label: "b".into(),
                    ..Default::default()
                },
                vec![],
            ),
            (
                RawMenuItem {
                    label: "c".into(),
                    ..Default::default()
                },
                vec![7, 8],
            ),
            (
                RawMenuItem {
                    label: "c1".into(),
                    ..Default::default()
                },
                vec![],
            ),
            (
                RawMenuItem {
                    label: "c2".into(),
                    ..Default::default()
                },
                vec![9],
            ),
            (
                RawMenuItem {
                    label: "c2.1".into(),
                    ..Default::default()
                },
                vec![],
            ),
        ];
        assert_eq!(r.len(), 10);
        assert_eq!(r[0].1, expect[0].1);
        assert_eq!(r[1].1, expect[1].1);
        assert_eq!(r[2].1, expect[2].1);
        assert_eq!(r[3].1, expect[3].1);
        assert_eq!(r[4].1, expect[4].1);
        assert_eq!(r[5].1, expect[5].1);
        assert_eq!(r[6].1, expect[6].1);
        assert_eq!(r[7].1, expect[7].1);
        assert_eq!(r[8].1, expect[8].1);
        assert_eq!(r[9].1, expect[9].1);
        assert_eq!(r[0].0.label, expect[0].0.label);
        assert_eq!(r[1].0.label, expect[1].0.label);
        assert_eq!(r[2].0.label, expect[2].0.label);
        assert_eq!(r[3].0.label, expect[3].0.label);
        assert_eq!(r[4].0.label, expect[4].0.label);
        assert_eq!(r[5].0.label, expect[5].0.label);
        assert_eq!(r[6].0.label, expect[6].0.label);
        assert_eq!(r[7].0.label, expect[7].0.label);
        assert_eq!(r[8].0.label, expect[8].0.label);
        assert_eq!(r[9].0.label, expect[9].0.label);
    }
}
