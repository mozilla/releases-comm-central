/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub use folder_listener::*;
pub use message_create_listener::*;
pub use message_fetch_listener::*;
pub use message_sync_listener::*;
pub use msg_db_hdr::*;
pub use msg_outgoing_listener::*;
pub use simple_operation_listener::*;
pub use uri::*;
pub use url_listener::*;

mod folder_listener;
mod message_create_listener;
mod message_fetch_listener;
mod message_sync_listener;
mod msg_db_hdr;
mod msg_outgoing_listener;
mod simple_operation_listener;
pub mod uri;
pub mod url_listener;

use nserror::nsresult;
use std::ops::Deref;
use xpcom::{interfaces::IEwsFallibleOperationListener, RefCounted, RefPtr, XpCom};

/// A non-public trait to get the internal listener of a [`SafeListener`].
trait UnsafeListener {
    /// Get a reference to the underlying unsafe listener type.
    fn unsafe_listener(&self) -> impl Deref<Target = impl XpCom>;
}

/// This trait represents the minimum common behavior all listeners are expected
/// to have.
// In this case, the use of a private supertrait is intentional: we want the
// default implementation to have access to the underlying unsafe type, but
// don't want the rest of the crate to be able to circumvent the safe wrapper
// (unless that becomes necessary, of course, in which case we can make
// `UnsafeListener` public and remove this allow).
#[allow(private_bounds)]
pub trait SafeListener: UnsafeListener {
    /// Argument to [`Self::on_success`].
    type OnSuccessArg;

    /// Argument to [`Self::on_failure`].
    type OnFailureArg;

    /// Safe wrapper for a callback that indicates success.
    fn on_success(&self, arg: Self::OnSuccessArg) -> Result<(), nsresult>;

    /// Safe wrapper for a callback that indicates failure.
    ///
    /// The default implementation works by casting to a [`IEwsFallibleOperationListener`].
    fn on_failure<E>(&self, err: &E, _arg: Self::OnFailureArg) -> Result<(), nsresult>
    where
        for<'a> &'a E: Into<nsresult> + TryInto<&'a moz_http::Error>,
        E: std::fmt::Debug,
    {
        let err = err.into();
        let unsafe_listener = self.unsafe_listener();

        if let Some(listener) = unsafe_listener.query_interface::<IEwsFallibleOperationListener>() {
            // SAFETY: nsresult is safe to use across the Rust/C++ boundary.
            unsafe { listener.OnOperationFailure(err) }.to_result()?;
        }
        Ok(())
    }
}

/// Wrapper newtype for the various listeners that utilizes only safe Rust types
/// in its public interface and handles converting to unsafe types and call to
/// the underlying unsafe C++ callbacks with validated data.
pub struct SafeListenerWrapper<L: RefCounted + 'static>(RefPtr<L>);

impl<L: RefCounted + 'static> SafeListenerWrapper<L> {
    /// Return a new wrapper for the given listener. The given borrow is placed
    /// into a [`RefPtr`] internally to ensure the memory management is done
    /// correctly across the XPCOM boundary and guarantees that the lifetime of
    /// the borrowed inner listener meets or exceeds the lifetime of the
    /// returned wrapper for use in asynchronous operations.
    pub fn new(unsafe_listener: &L) -> Self {
        Self(RefPtr::new(unsafe_listener))
    }
}

impl<L: XpCom> UnsafeListener for SafeListenerWrapper<L> {
    fn unsafe_listener(&self) -> impl Deref<Target = impl XpCom> {
        self.0.clone()
    }
}

/// Perform any actions appropriate when an error associated with the listener is encountered.
pub fn handle_error<L, E>(listener: &L, op_name: &str, err: &E, on_failure_arg: L::OnFailureArg)
where
    L: SafeListener,
    for<'a> &'a E: Into<nsresult> + TryInto<&'a moz_http::Error>,
    E: std::fmt::Debug,
{
    log::error!("an error occurred when performing operation {op_name}: {err:?}");

    if let Err(err) = listener.on_failure(err, on_failure_arg) {
        log::error!("the error callback returned a failure ({err})");
    }
}
