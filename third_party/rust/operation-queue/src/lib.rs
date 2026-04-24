/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Turn the nightly `doc_cfg` attribute on for docs.rs, so it mentions which
// types/modules are gated behind specific features.
#![cfg_attr(docsrs, feature(doc_cfg))]

//! This crate contains the queueing logic for asynchronous operations.
//!
//! It also contains helpers for synchronizing operations such as error handling
//! across futures, in the [`line_token`] module.
//!
//! # The operation queue
//!
//! The queueing of operations is handled by the [`OperationQueue`] struct. It
//! runs a given number of parallel runners, to which it dispatches operations
//! on a "first come, first served" basis.
//!
//! An operation is a data structure that implements the [`QueuedOperation`]
//! trait, and is started by the queue calling its `perform` method. Because
//! this method is asynchronous, thus breaking [dyn compatibility], another
//! trait that is dyn-compatible ([`ErasedQueuedOperation`]) is used by the
//! queue. However, `ErasedQueuedOperation` is implemented by any type that
//! implements `QueuedOperation`, so consumers usually don't need to bother with
//! it.
//!
//! [`OperationQueue`] is runtime-agnostic, meaning it is not designed to work
//! only with a specific asynchronous runtime. However, it still needs to spawn
//! a task for each of its runners. This is why [`OperationQueue::new`] takes a
//! function as its sole argument, which is given the future for a runner's
//! loop. For example, creating a new queue with the `tokio` crate could look
//! like this:
//!
//! ```
//! # use operation_queue::OperationQueue;
//! let queue = OperationQueue::new(|fut| {
//!     let _ = tokio::task::spawn_local(fut);
//! });
//! ```
//!
//! The queue is started by [`OperationQueue::start`], and stopped by
//! [`OperationQueue::stop`]. When starting the queue, the number of runners
//! provided as the function's argument are created and started. A runner is a
//! small stateful `struct` with an infinite asynchronous loop. Upon stopping,
//! the queue terminates and clears all current runners. Note that, once
//! stopped, a queue cannot be started again.
//!
//! Queuing operations is done with [`OperationQueue::enqueue`]. The operation
//! is pushed to the back of the queue, and will be performed whenenever the
//! previous operations have also been performed and a runner becomes available.
//!
//! # Multithreading
//!
//! The synchronization helpers in the [`line_token`] module are thread-safe.
//!
//! However, in order to maintain compatibility with the current Thunderbird
//! code-base, the operation queue's runner cannot be sent between threads.
//! This is something we plan to address in the future.
//!
//! [dyn compatibility]:
//!     <https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility>

#[cfg(feature = "line_token")]
pub mod line_token;

// The queue is the main feature from this crate, so expose it at the top-level.
mod error;
mod operation_queue;
pub use error::*;
pub use operation_queue::*;
