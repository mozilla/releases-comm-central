/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Non-`Send` variant of the queue's operation traits, used when the `send`
//! feature is disabled.

use std::{fmt::Debug, future::Future, pin::Pin};

/// An operation that can be added to an [`OperationQueue`](crate::OperationQueue).
#[allow(async_fn_in_trait)]
pub trait QueuedOperation: Debug {
    /// Performs the operation asynchronously.
    async fn perform(&self);
}

/// A dyn-compatible version of [`QueuedOperation`]. It is implemented for all
/// types that implement [`QueuedOperation`].
///
/// [`ErasedQueuedOperation`] makes [`QueuedOperation`] dyn-compatible by
/// wrapping the opaque [`Future`] returned by `perform` into a [`Box`], which
/// is essentially an owned pointer and which size is known at compile time.
/// This makes `perform` dispatchable from a trait object.
///
/// This return value is further wrapped into a [`Pin`] so that the `Future` can
/// be `await`ed (since the receiver for [`Future::poll`] is `Pin<&mut Self>`).
///
/// In this context, "erased" refers to how this trait "erases" the
/// opaque/generic return type of [`QueuedOperation::perform`] by turning it
/// into a trait object.
pub trait ErasedQueuedOperation: Debug {
    fn perform<'op>(&'op self) -> Pin<Box<dyn Future<Output = ()> + 'op>>;
}

impl<T> ErasedQueuedOperation for T
where
    T: QueuedOperation,
{
    fn perform<'op>(&'op self) -> Pin<Box<dyn Future<Output = ()> + 'op>> {
        Box::pin(self.perform())
    }
}

/// The type used to spawn a runner's loop, e.g. `tokio::task::spawn_local`.
/// Must not be blocking.
pub(crate) type SpawnTaskFn = fn(Pin<Box<dyn Future<Output = ()>>>);
