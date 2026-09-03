# Front-end Performance

## Non-blocking Large UI Renders

When large UI renders are required, [it's important not to block the UI for more
than 100ms](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_long_is_too_long#responsiveness_goal). However, sometimes rendering will
take longer than that.

To avoid locking the UI, and ensuring the user perceives a responsive interface,
use [the Gecko Scheduler API](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler)
to schedule prioritized tasks.

If a later call can make an in-progress chunked render stale (for example, the
same UI is re-rendered with new data before the previous render finished), use
an `AbortController` so the stale render stops appending to the DOM instead of
racing with the new one. Check `signal.throwIfAborted()` at each chunk boundary,
and let the caller `abort()` the previous controller before starting a new
render.

Example:

```js
let renderAbortController = null;

async function renderItems(items) {
  // Abort any render still in progress so it doesn't keep appending after
  // this newer render has started.
  renderAbortController?.abort();
  renderAbortController = new AbortController();
  const { signal } = renderAbortController;

  // This callback contains the actual work. It can be run by the scheduler when
  // available, or directly in environments where scheduler is unavailable.
  const renderChunked = async () => {
    signal.throwIfAborted();

    let count = 0;

    for (const item of items) {
      renderItem(item);

      // After every 50 items, yield back to the main thread so the UI can
      // process input, painting, and other queued work before continuing.
      // This number should be adjusted based on the expected render time
      // of each item.
      if (++count == 50) {
        count = 0;
        signal.throwIfAborted();
        await globalThis.scheduler?.yield();
      }
    }
  };

  try {
    // Use scheduler.postTask when available so this work is scheduled with an
    // explicit priority instead of running immediately on the current call stack.
    if (globalThis.scheduler) {
      await globalThis.scheduler.postTask(renderChunked, {
        signal
      });
    } else {
      // Fallback for environments that do not expose scheduler, such as some tests.
      await renderChunked();
    }
  } catch (error) {
    // Swallow the exception raised by our own throwIfAborted() call, but
    // rethrow anything unexpected.
    if (!signal.aborted) {
      throw error;
    }
  }
}
```
