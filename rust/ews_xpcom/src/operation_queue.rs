/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module contains the request queueing logic for EWS operations.
//!
//! It exposes two types:
//!
//! * [`OperationQueue`], which is a struct that represents the queue of
//!   requests attached to an EWS client, and
//! * [`QueuedOperation`], which is a trait representing an operation that can
//!   be added to the queue.
//!
//! Consumers can add any type that implement the [`QueuedOperation`] to the end
//! of an [`OperationQueue`] via [`OperationQueue::enqueue`].
//!
//! # How it works
//!
//! The queue is expected to be used while wrapped with an [`Arc`].
//!
//! The queue's inner buffer is an unbounded MPMC channel from
//! [`async_channel`]. When enqueueing a new operation (using
//! [`OperationQueue::enqueue`]), it is sent through this channel via the
//! matching [`async_channel::Sender`].
//!
//! [`OperationQueue::start`] starts an infinite loop in the background for each
//! runner. This loop waits for a new operation to be queued (or gets the next
//! operation in line) by `await`ing the inner channel's
//! [`async_channel::Receiver`], and performs it.
//!
//! Each operation is thus performed in order, the next one waiting for the
//! previous one to complete. Multiple operations may run in parallel, depending
//! on the number of items on the queue and the number of runners specified to
//! [`OperationQueue::start`].
//!
//! Performing an operation also includes handling authentication and throttling
//! errors, which includes retrying the request if necessary. This means that,
//! if an operation needs to be retried due to this kind of failure, these
//! retries are performed *before* the next operation. This is because
//! authentication and throttling errors impact all operations indiscriminately,
//! so pushing retries at the back of the queue (rather than performing them
//! immediately) means performing a bunch of requests we know will fail.
//!
//! [`OperationQueue::stop`] stops all of the runners by closing the underlying
//! [`async_channel`] channel. Operations that have already been queued up by
//! this point are still performed in order, but any subsequent call to
//! [`OperationQueue::enqueue`] return with an error. Runners ultimately break
//! out of their loop once the channel is empty.
//!
//! # Design considerations
//!
//! This queue relies on multiple levels of abstraction to define the type of an
//! operation, from the queue's point of view. While [`QueuedOperation`] is the
//! public-facing trait that consumers should implement,
//! [`ErasedQueuedOperation`] is the type of operations the queue actually sees.
//! It wraps around [`QueuedOperation`] in such a way that both the queue and
//! its runners can use it as a trait object. This is necessary because
//! [`QueuedOperation::perform`] is an async method, which would break [Rust's
//! rules on dyn compatibility] (since `async fn` is a shorthand for returning
//! `impl Future<...>`, an opaque type which size cannot be known at compile
//! time).
//!
//! Regarding the design of the queue itself, a previous approach involved using
//! a [`VecDeque`] as the queue's inner buffer, but relying on [`async_channel`]
//! allows simplifying the queue's structure, as well as the logic for waiting
//! for new items to become available.
//!
//! Queueing requests in [`moz_http`] was also considered, but this approach was
//! abandonned as well since it would mean retries due to throttling or
//! authentication issues would be be added to the back of the queue rather than
//! performed immediately.
//!
//! [`Arc`] is used in a few places to ensure memory is correctly managed. Since
//! we only dispatch to the local thread, [`Rc`] could be used instead. However,
//! it would make sense to, in a next step, look into dispatching to the
//! background tasks thread pool instead. In this context, using `Arc` could
//! avoid a hefty change in the future (at a negligible performance cost).
//!
//! [Rust's rules on dyn compatibility]:
//!     <https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility>
//! [`VecDeque`]: std::collections::VecDeque
//! [`Rc`]: std::rc::Rc

use std::{
    cell::{Cell, RefCell},
    fmt::Debug,
    future::Future,
    pin::Pin,
    sync::Arc,
};

use async_channel::{Receiver, Sender};
use xpcom::RefCounted;

use crate::{client::ServerType, error::XpComEwsError, operation_sender::OperationSender};

/// An operation that can be added to an [`OperationQueue`].
pub(crate) trait QueuedOperation<ServerT: RefCounted + 'static>: Debug {
    /// Performs the operation using the given [`OperationSender`].
    async fn perform(&self, op_sender: Arc<OperationSender<ServerT>>);
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
/// The "erased" word in this type's name refers to how we use a trait object in
/// `perform`'s return value (`dyn Future<...>`) to remove the need to know the
/// specific implementation of `Future` at compile time, thus "erasing" the
/// concrete type that's being returned.
pub trait ErasedQueuedOperation<ServerT: RefCounted + 'static>: Debug {
    fn perform<'op>(
        &'op self,
        op_sender: Arc<OperationSender<ServerT>>,
    ) -> Pin<Box<dyn Future<Output = ()> + 'op>>;
}

impl<ServerT, T> ErasedQueuedOperation<ServerT> for T
where
    ServerT: RefCounted + 'static,
    T: QueuedOperation<ServerT>,
{
    fn perform<'op>(
        &'op self,
        op_sender: Arc<OperationSender<ServerT>>,
    ) -> Pin<Box<dyn Future<Output = ()> + 'op>> {
        Box::pin(self.perform(op_sender))
    }
}

pub(crate) struct OperationQueue<ServerT: ServerType + 'static> {
    op_sender: Arc<OperationSender<ServerT>>,
    channel_sender: Sender<Box<dyn ErasedQueuedOperation<ServerT>>>,
    channel_receiver: Receiver<Box<dyn ErasedQueuedOperation<ServerT>>>,
    runners: RefCell<Vec<Arc<Runner<ServerT>>>>,
}

impl<ServerT: ServerType + 'static> OperationQueue<ServerT> {
    /// Creates a new operation queue.
    ///
    /// Since most methods require the queue to be wrapped inside an [`Arc`],
    /// this method also takes care of this.
    pub fn new(op_sender: Arc<OperationSender<ServerT>>) -> Arc<OperationQueue<ServerT>> {
        let (snd, rcv) = async_channel::unbounded();

        let queue = OperationQueue {
            op_sender,
            channel_sender: snd,
            channel_receiver: rcv,
            runners: RefCell::new(Vec::new()),
        };

        Arc::new(queue)
    }

    /// Starts the given number of runners that consume new items pushed to the
    /// queue.
    ///
    /// A runner loops infinitely, performing operations as they get queued.
    ///
    /// This method detaches the runners to let them run in the background, and
    /// returns immediately.
    pub fn start(self: Arc<OperationQueue<ServerT>>, runners: u32) {
        for i in 0..runners {
            let runner = Runner::new(i, self.op_sender.clone(), self.channel_receiver.clone());
            moz_task::spawn_local("RequestQueue", runner.clone().run()).detach();
            self.runners.borrow_mut().push(runner);
        }
    }

    /// Pushes an operation to the back of the queue.
    ///
    /// An error can be returned if the inner channel is closed.
    pub async fn enqueue(
        &self,
        op: Box<dyn ErasedQueuedOperation<ServerT>>,
    ) -> Result<(), XpComEwsError> {
        self.channel_sender.send(op).await?;
        Ok(())
    }

    /// Stops the queue.
    ///
    /// Operations that have already been queued up will still be performed, but
    /// any call to [`enqueue`] following a call to `stop` will fail.
    ///
    /// [`enqueue`]: OperationQueue::enqueue
    pub fn stop(&self) {
        if !self.channel_sender.close() {
            log::warn!("request queue: attempted to close channel that's already closed");
        }
    }

    /// Checks whether one or more runner(s) is currently active.
    ///
    /// If a runner has been created but isn't running yet, it is still included
    /// in this count. Thus a runner being active means it's in any state other
    /// than fully stopped.
    pub fn running(&self) -> bool {
        // Count every runner that's not permanently stopped. This should be
        // fine, since the only place we mutably borrow `self.runners` is
        // `start` and:
        //  * both `start` and `running` are expected to be run in the same
        //    thread/routine, and
        //  * both are synchronous functions so there should be no risk of one
        //    happening while the other waits.
        let active_runners =
            self.count_matching_runners(|runner| !matches!(runner.state(), RunnerState::Stopped));

        log::debug!("{active_runners} runner(s) currently active");

        // Check if there's at least one runner currently active.
        active_runners > 0
    }

    pub fn idle(&self) -> bool {
        // Count every runner that's waiting for a new operation to perform.
        // This should be fine, since the only place we mutably borrow
        // `self.runners` is `start` and:
        //  * both `start` and `idle` are expected to be run in the same
        //    thread/routine, and
        //  * both are synchronous functions so there should be no risk of one
        //    happening while the other waits.
        let idle_runners =
            self.count_matching_runners(|runner| matches!(runner.state(), RunnerState::Waiting));

        log::debug!("{idle_runners} runner(s) currently idle");

        // If `self.runner` was being mutably borrowed here, we would have
        // already panicked when calling `self.count_matching_runners()`.
        idle_runners == self.runners.borrow().len()
    }

    /// Counts the number of runners matching the given closure. The type of the
    /// closure is the same that would be used by [`Iterator::filter`].
    ///
    /// # Panics
    ///
    /// This method will panic if it's called while `self.runners` is being
    /// mutably borrowed.
    fn count_matching_runners<PredicateT>(&self, predicate: PredicateT) -> usize
    where
        PredicateT: FnMut(&&Arc<Runner<ServerT>>) -> bool,
    {
        self.runners.borrow().iter().filter(predicate).count()
    }
}

/// The status of a runner.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum RunnerState {
    /// The runner has been created but isn't running yet.
    Pending,

    /// The runner is currently waiting for an operation to perform.
    Waiting,

    /// The runner is currently performing an operation.
    Running,

    /// The runner has finished performing its last operation and has exited its
    /// main loop.
    Stopped,
}

/// A runner created and run by the [`OperationQueue`].
///
/// Each runner works by entering an infinite loop upon calling [`Runner::run`],
/// which is only exited when the queue's channel is closed and has been
/// emptied.
///
/// The current state of the runner can be checked at any time with
/// [`Runner::state`].
struct Runner<ServerT: ServerType + 'static> {
    op_sender: Arc<OperationSender<ServerT>>,
    receiver: Receiver<Box<dyn ErasedQueuedOperation<ServerT>>>,
    state: Cell<RunnerState>,

    // A numerical identifier attached to the current runner, used for
    // debugging.
    id: u32,
}

impl<ServerT: ServerType + 'static> Runner<ServerT> {
    /// Creates a new [`Runner`], wrapped into an [`Arc`].
    ///
    /// `id` is a numerical identifier used for debugging.
    fn new(
        id: u32,
        op_sender: Arc<OperationSender<ServerT>>,
        receiver: Receiver<Box<dyn ErasedQueuedOperation<ServerT>>>,
    ) -> Arc<Runner<ServerT>> {
        Arc::new(Runner {
            id,
            op_sender,
            receiver,
            state: Cell::new(RunnerState::Pending),
        })
    }

    /// Starts a loop that waits for new operations to come down the inner
    /// channel and performs them.
    ///
    /// This method does not explicitly take care of sharing the operation's
    /// response to the consumer; this is expected to be done by
    /// [`QueuedOperation::perform`].
    async fn run(self: Arc<Runner<ServerT>>) {
        loop {
            self.state.replace(RunnerState::Waiting);

            let op = match self.receiver.recv().await {
                Ok(op) => op,
                Err(_) => {
                    log::info!(
                        "request queue: channel has closed (likely due to client shutdown), exiting the loop"
                    );
                    self.state.replace(RunnerState::Stopped);
                    return;
                }
            };

            self.state.replace(RunnerState::Running);

            log::info!(
                "operation_queue::Runner: runner {} performing op: {op:?}",
                self.id
            );

            op.perform(self.op_sender.clone()).await;
        }
    }

    /// Gets the runner's current state.
    fn state(&self) -> RunnerState {
        self.state.get()
    }
}
