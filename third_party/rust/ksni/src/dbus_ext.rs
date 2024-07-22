use std::cell::Cell;
use std::ptr::NonNull;

use dbus::blocking::LocalConnection;

thread_local! {
    static CURRENT_DBUS_CONN: Cell<Option<NonNull<LocalConnection>>> = Cell::new(None);
}

#[derive(Debug)]
pub struct NoCurrentErr;

pub fn with_current<F: FnOnce(&LocalConnection) -> R, R>(f: F) -> Result<R, NoCurrentErr> {
    CURRENT_DBUS_CONN
        .with(|v| {
            v.get().map(|conn| {
                let conn = unsafe { conn.as_ref() };
                f(conn)
            })
        })
        .ok_or(NoCurrentErr)
}

pub fn with_conn<F: FnOnce() -> R, R>(conn: &LocalConnection, f: F) -> R {
    CURRENT_DBUS_CONN.with(|v| {
        let was = v.get();
        struct Reset(Option<NonNull<LocalConnection>>);
        impl Drop for Reset {
            fn drop(&mut self) {
                CURRENT_DBUS_CONN.with(|v| v.set(self.0));
            }
        }
        let _reset = Reset(was);

        unsafe { v.set(Some(NonNull::new_unchecked(conn as *const _ as *mut _))) }
        f()
    })
}
