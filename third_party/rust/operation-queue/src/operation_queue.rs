/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module defines the types and data structures for the operation queue.
//! See the crate's top-level documentation.

use std::{
    cell::{Cell, RefCell},
    fmt::Debug,
    future::Future,
    pin::Pin,
    sync::Arc,
};

use async_channel::{Receiver, Sender};

use crate::error::Error;

/// An operation that can be added to an [`OperationQueue`].
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

/// A queue that performs asynchronous operations in order.
//
// Design considerations:
//
//  * A previous approach involved using a `VecDeque` as the queue's inner
//    buffer, but relying on `async_channel` allows simplifying the queue's
//    structure, as well as the logic for waiting for new items to become
//    available.
//
//  * `Arc` is used to keep track of runners in a way that ensures memory is
//    properly managed. For compatibility with current Thunderbird code, the
//    queue's item type (`ErasedQueuedOperation`) does not include a bound on
//    `Send` and/or `Sync`, so `Rc` could be used instead. However, we plan to,
//    at a later time, address the current thread safety issues within the
//    Thunderbird code base which currently prevent dispatching runners across
//    multiple threads. In this context, we believe using `Arc` right away will
//    avoid a hefty change in the future (at a negligible performance cost).
pub struct OperationQueue {
    channel_sender: Sender<Box<dyn ErasedQueuedOperation>>,
    channel_receiver: Receiver<Box<dyn ErasedQueuedOperation>>,
    runners: RefCell<Vec<Arc<Runner>>>,
    spawn_task: fn(fut: Pin<Box<dyn Future<Output = ()>>>),
}

impl OperationQueue {
    /// Creates a new operation queue.
    ///
    /// The function provided as argument is used when spawning new runners,
    /// e.g. `tokio::task::spawn_local`. It must not be blocking.
    pub fn new(spawn_task: fn(fut: Pin<Box<dyn Future<Output = ()>>>)) -> OperationQueue {
        let (snd, rcv) = async_channel::unbounded();

        OperationQueue {
            channel_sender: snd,
            channel_receiver: rcv,
            runners: RefCell::new(Vec::new()),
            spawn_task,
        }
    }

    /// Starts the given number of runners that consume new items pushed to the
    /// queue.
    ///
    /// A runner loops infinitely, performing operations as they get queued.
    ///
    /// An error can be returned if the queue has previously been stopped.
    pub fn start(&self, runners: u32) -> Result<(), Error> {
        if self.channel_sender.is_closed() {
            return Err(Error::Stopped);
        }

        for i in 0..runners {
            let runner = Runner::new(i, self.channel_receiver.clone());
            (self.spawn_task)(Box::pin(runner.clone().run()));
            self.runners.borrow_mut().push(runner);
        }

        Ok(())
    }

    /// Pushes an operation to the back of the queue.
    ///
    /// This function can be used with any type that implements
    /// [`QueuedOperation`], since [`ErasedQueuedOperation`] is automatically
    /// implemented for all such implementations.
    ///
    /// An error can be returned if the queue has been stopped.
    pub async fn enqueue(&self, op: Box<dyn ErasedQueuedOperation>) -> Result<(), Error> {
        self.channel_sender.send(op).await?;
        Ok(())
    }

    /// Stops the queue.
    ///
    /// Operations that have already been queued up will still be performed, but
    /// any call to [`start`] or [`enqueue`] following a call to `stop` will fail.
    ///
    /// [`start`]: OperationQueue::start
    /// [`enqueue`]: OperationQueue::enqueue
    pub async fn stop(&self) {
        if !self.channel_sender.close() {
            log::warn!("request queue: attempted to close channel that's already closed");
        }

        // Clear the references we have on the runners, so they can be dropped
        // when they finish running.
        self.runners.borrow_mut().clear();
    }

    /// Checks whether one or more runner(s) is currently active.
    ///
    /// If a runner has been created but isn't running yet, it is still included
    /// in this count. Thus a runner being active means it's in any state other
    /// than fully stopped.
    ///
    /// This method also returns `false` if there aren't any runners (e.g. if
    /// the queue hasn't been started yet, or it has been stopped).
    pub fn running(&self) -> bool {
        // Count every runner that's not permanently stopped. This should be
        // fine, since the only places we mutably borrow `self.runners` are
        // `start` and `stop` and:
        //  * both `start`, `stop` and `running` are expected to be run in the
        //    same thread/routine, and
        //  * both are synchronous functions so there should be no risk of one
        //    happening while the other waits.
        let active_runners =
            self.count_matching_runners(|runner| !matches!(runner.state(), RunnerState::Stopped));

        log::debug!("{active_runners} runner(s) currently active");

        // Check if there's at least one runner currently active.
        active_runners > 0
    }

    /// Checks whether all runners are currently waiting for a new operation to
    /// perform.
    pub fn idle(&self) -> bool {
        // Count every runner that's waiting for a new operation to perform.
        // This should be fine, since the only places we mutably borrow
        // `self.runners` are `start` and `stop` and:
        //  * both `start`, `stop` and `idle` are expected to be run in the
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
        PredicateT: FnMut(&&Arc<Runner>) -> bool,
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
struct Runner {
    receiver: Receiver<Box<dyn ErasedQueuedOperation>>,
    state: Cell<RunnerState>,

    // A numerical identifier attached to the current runner, used for
    // debugging.
    id: u32,
}

impl Runner {
    /// Creates a new [`Runner`], wrapped into an [`Arc`].
    ///
    /// `id` is a numerical identifier used for debugging.
    ///
    /// Since [`Runner::run`] requires the queue to be wrapped inside an
    /// [`Arc`], this is how this method returns the new queue.
    //
    // See the design consideration comment for `OperationQueue` regarding the
    // use of `Arc`.
    #[allow(clippy::arc_with_non_send_sync)]
    fn new(id: u32, receiver: Receiver<Box<dyn ErasedQueuedOperation>>) -> Arc<Runner> {
        Arc::new(Runner {
            id,
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
    async fn run(self: Arc<Runner>) {
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

            op.perform().await;
        }
    }

    /// Gets the runner's current state.
    fn state(&self) -> RunnerState {
        self.state.get()
    }
}

#[cfg(test)]
// For simplicity, we run our async tests using tokio's local runtime using the
// unstable "local" value for the `flavor` argument in `tokio::test`. Because it
// comes from tokio's unstable API, we need to supply the `tokio_unstable` cfg
// condition, which in turn triggers a warning from within the `tokio::test`
// macro about an unexpected cfg condition name.
#[allow(unexpected_cfgs)]
mod tests {
    use super::*;

    use async_channel::Sender;
    use tokio::time::Duration;

    fn new_queue() -> OperationQueue {
        OperationQueue::new(|fut| {
            _ = tokio::task::spawn_local(fut);
        })
    }

    #[tokio::test(flavor = "local")]
    async fn start_queue() {
        let queue = new_queue();

        queue.start(5).unwrap();
        assert_eq!(queue.runners.borrow().len(), 5);

        // We need to await something to give the runners a chance to start
        // their loops.
        tokio::time::sleep(Duration::from_millis(0)).await;
        assert!(queue.idle());
    }

    #[tokio::test(flavor = "local")]
    async fn stop_queue() {
        let queue = new_queue();

        queue.start(5).unwrap();

        // We need to await something to give the runners a chance to start
        // their loops.
        tokio::time::sleep(Duration::from_millis(0)).await;
        assert!(queue.idle());

        queue.stop().await;
        assert!(!queue.running());
        assert!(queue.channel_receiver.is_closed());

        match queue.start(1) {
            Ok(_) => panic!("we should not be able to start the queue after stopping it"),
            Err(Error::Stopped) => (),
            Err(_) => panic!("unexpected error"),
        }

        // Try to enqueue a dummy operation to make sure it fails.
        #[derive(Debug)]
        struct Operation {}
        impl QueuedOperation for Operation {
            async fn perform(&self) {}
        }

        let op = Box::new(Operation {});
        match queue.enqueue(op).await {
            Ok(_) => panic!("we should not be able to enqueue operations after stopping the queue"),
            Err(Error::Sender) => (),
            Err(_) => panic!("unexpected error"),
        }
    }

    #[tokio::test(flavor = "local")]
    async fn operation_order() {
        // A simple operation with a numerical ID that sends its own ID through
        // a channel.
        #[derive(Debug)]
        struct Operation {
            id: u8,
            sender: Sender<u8>,
        }
        impl QueuedOperation for Operation {
            async fn perform(&self) {
                self.sender.send(self.id).await.unwrap();
            }
        }

        let queue = new_queue();

        // Create a channel the operations can use to send us their ID.
        let (sender, receiver) = async_channel::unbounded();

        // Enqueue a couple of operations.
        queue
            .enqueue(Box::new(Operation {
                id: 1,
                sender: sender.clone(),
            }))
            .await
            .unwrap();

        queue
            .enqueue(Box::new(Operation {
                id: 2,
                sender: sender.clone(),
            }))
            .await
            .unwrap();

        // Start exactly one runner so we can check that operations run in
        // order.
        queue.start(1).unwrap();

        // We need to await something to give the runner a chance to start and
        // perform operations.
        tokio::time::sleep(Duration::from_millis(0)).await;

        // Check that we got both IDs in order.
        let id = receiver.recv().await.unwrap();
        assert_eq!(id, 1);
        let id = receiver.recv().await.unwrap();
        assert_eq!(id, 2);

        // For bonus points: the queue should be fully idle now.
        assert!(queue.idle());
    }
}
