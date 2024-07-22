use dbus::arg;

/// org.freedesktop.DBus.NameOwnerChanged
///
/// https://dbus.freedesktop.org/doc/dbus-specification.html#bus-messages-name-owner-changed
#[derive(Debug)]
pub struct NameOwnerChanged {
    pub name: String,
    pub old_owner: String,
    pub new_owner: String,
}

impl arg::AppendAll for NameOwnerChanged {
    fn append(&self, i: &mut arg::IterAppend) {
        arg::RefArg::append(&self.name, i);
        arg::RefArg::append(&self.old_owner, i);
        arg::RefArg::append(&self.new_owner, i);
    }
}

impl arg::ReadAll for NameOwnerChanged {
    fn read(i: &mut arg::Iter) -> Result<Self, arg::TypeMismatchError> {
        Ok(NameOwnerChanged {
            name: i.read()?,
            old_owner: i.read()?,
            new_owner: i.read()?,
        })
    }
}

impl dbus::message::SignalArgs for NameOwnerChanged {
    const NAME: &'static str = "NameOwnerChanged";
    const INTERFACE: &'static str = "org.freedesktop.DBus";
}
