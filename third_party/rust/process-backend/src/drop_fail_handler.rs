//! Set a custom handler for when a Drop failure occurs
//!
//! Normally, there is not much that can be done when an error occurs during execution of `drop()`
//! -- Common strategies are to just ignore it, or to just log it and ignore it.
//!
//! We prefer the latter approach, but the issue is that if a Rust global logger has been set up
//! in the crashed process that will run the Executor, that could result in `log` being used in
//! a signal handler context. And since common logging behavior is to print to stderr, that will
//! almost-certainly cause a deadlock or some kind of other re-entrancy issue.
//!
//! Instead, we don't prescribe a behavior - We allow the user of minidump-writer to set their
//! own handler for failed `drop()` calls. If the user knows it's safe to log or print or
//! whatever, they can do that.
//!
//! Note that using [`install_global()`] to install a new handler will always overwrite any
//! previously-installed handler. This is intentional, as the user of this crate may want to
//! disable a previously-installed handler after a crash occurs (if that handler would cause
//! re-entrancy issues)

use core::sync::atomic::{AtomicPtr, Ordering};

static HANDLER: AtomicPtr<Handler> = AtomicPtr::new(core::ptr::null_mut());

pub struct Handler {
    pub(crate) f: for<'a> fn(core::fmt::Arguments<'a>),
}

impl Handler {
    /// Decorate the given function as a potential global Drop handler
    pub const fn new(f: for<'a> fn(core::fmt::Arguments<'a>)) -> Self {
        Self { f }
    }
    /// Install this handler as the new global Drop handler
    ///
    /// Will overwrite any previously installed handler
    pub fn install_global(&'static self) {
        HANDLER.store((self as *const Handler).cast_mut(), Ordering::Release);
    }
}

pub(crate) fn get() -> Option<&'static Handler> {
    let ptr: *const Handler = HANDLER.load(Ordering::Acquire).cast_const();
    if ptr.is_null() {
        None
    } else {
        Some(unsafe { &*ptr })
    }
}

macro_rules! report_drop_failed(($($arg: tt)*) => {{
    if let Some(handler) = $crate::drop_fail_handler::get() {
        (handler.f)(::core::format_args!($($arg)*));
    }
}});
