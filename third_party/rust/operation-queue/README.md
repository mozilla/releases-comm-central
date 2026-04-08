# Operation queue

Rust helpers for synchronizing asynchronous protocol operations.

## Queueing operations

An operation is any data structure that implements the `QueuedOperation` trait.
`QueuedOperation` implementations can be pushed to the back of an
`OperationQueue`, and they will be performed once all previous operations have
been performed and a runner is available.

```rust
use operation_queue::{OperationQueue, QueuedOperation};

// The number of operations to push to the queue.
const OPERATION_COUNT: usize = 100;

// The number of parallel runners the queue will start. Each runner performs
// one operation at a time.
const RUNNER_COUNT: usize = 100;

struct Operation {
    // Fields...
}

impl QueuedOperation for Operation {
    async fn perform() {
        // Perform the operation...
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let queue = OperationQueue::new(|runner_fut| {
        let _ = tokio::spawn(runner_fut);
    });

    queue
        .start(RUNNER_COUNT)
        .expect("failed to start the queue");

    for i in 0..OPERATION_COUNT {
        let op = Operation { /** ... */ };
        queue
            .enqueue(Box::new(op))
            .await
            .expect("failed to enqueue operation");
    }

    // Do things, or wait for some shutdown signal...

    queue.stop().await;
}
```

## Synchronizing futures

This crate also provides helpers for synchronizing futures across operations
that should only run once at a time. These are located in the `line_token`
module, which requires the `line_token` feature.

An example in which this module can help is handling authentication failures
when sending multiple parallel requests to the same service: one request
encountering this kind of failure usually means the other requests will
encounter it too, and having each request try to re-authenticate at the same
time is wasteful (in the best of cases).

```rust
use operation_queue::line_token::{AcquireOutcome, Line, Token};

struct Request {
    error_handling_line: Line,
    // Other fields...
}

impl Request {
    fn new() -> Request {
        Request {
            error_handling_line: Line::new(),
        }
    }

    async fn perform(&self) -> Result<(), Error> {
        // Keep track of the token; if we've acquired it and dropped it, the
        // line will be released. We want to make sure the error has been
        // properly handled before this happens, which might include retrying
        // the request (and running through multiple iterations of the loop).
        let mut token: Option<Token<'_>> = None;

        let response = loop {
            match self.make_and_send_request() {
                Ok(response) => break response,
                Err(err) => {
                    // Try to acquire the token for this line.
                    // `AcquireOutcome::or_token` allows us to easily
                    // substitute the token if we have alread acquired it in a
                    // previous attempt.
                    token = match self.error_handling_line.try_acquire_token().or_token(token) {
                        // We've successfully acquired the token, let's handle
                        // this error.
                        AcquireOutcome::Success(new_token) => {
                            self.handle_error(err).await?;
                            Some(new_token)
                        }

                        // The token has already been acquired by another
                        // request, let's wait for them to finish and retry.
                        AcquireOutcome::Failure(shared) => {
                            shared.await?;
                            None
                        }
                    };
                }
            }

            // We've encountered an error but it has been dealt with (either
            // by us or by another request). Let's try the request again.
            continue;
        };

        // Do something with the response...

        // We've finished sending the request and processing the response. If
        // we were holding a token, it will now go out of scope and release the
        // line.
        Ok(())
    }
}
```

# Running tests

Some tests in this crate rely on tokio's [unstable
API](https://docs.rs/tokio/latest/tokio/index.html#unstable-features).
Therefore, running them requires the `--cfg tokio_unstable` compiler flag:

```shell
$ RUSTFLAGS="--cfg tokio_unstable" cargo test --all-features
```
