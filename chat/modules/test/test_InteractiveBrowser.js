/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { InteractiveBrowser, CancelledError } = ChromeUtils.importESModule(
  "resource:///modules/InteractiveBrowser.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function test_waitForRedirectOnLocationChange() {
  const url = "https://example.com";
  const promptText = "lorem ipsum";
  const { window, webProgress } = getRequestStubs();

  const observeTopic = TestUtils.topicObserved("browser-request");
  let resolved = false;
  const request = InteractiveBrowser.waitForRedirect(url, promptText).then(
    redirectUrl => {
      resolved = true;
      return redirectUrl;
    }
  );
  const [subject] = await observeTopic;

  subject.wrappedJSObject.loaded(window, webProgress);
  await TestUtils.waitForTick();
  ok(webProgress.listener, "Progress listener added");
  equal(window.document.title, promptText, "Window title set");

  const intermediate = "https://intermediate.example.com/";
  webProgress.listener.onLocationChange(
    webProgress,
    {
      name: intermediate + 1,
    },
    {
      spec: intermediate + 1,
    }
  );
  ok(
    webProgress.listener,
    "Progress listener still there after intermediary redirect"
  );
  ok(!resolved, "Still waiting for redirect");
  webProgress.listener.onStateChange(
    webProgress,
    {
      name: intermediate + 2,
    },
    Ci.nsIWebProgressListener.STATE_START,
    null
  );
  ok(webProgress.listener, "Listener still there after second redirect");
  ok(!resolved, "Still waiting for redirect 2");

  const completionUrl = InteractiveBrowser.COMPLETION_URL + "/test?code=asdf";
  webProgress.listener.onLocationChange(
    webProgress,
    {
      name: completionUrl,
    },
    {
      spec: completionUrl,
    }
  );

  const redirectedUrl = await request;
  ok(resolved, "Redirect complete");
  equal(redirectedUrl, completionUrl);

  ok(!webProgress.listener);
  ok(window.closed);
});

add_task(async function test_waitForRedirectOnStateChangeStart() {
  const url = "https://example.com";
  const promptText = "lorem ipsum";
  const { window, webProgress } = getRequestStubs();

  const observeTopic = TestUtils.topicObserved("browser-request");
  let resolved = false;
  const request = InteractiveBrowser.waitForRedirect(url, promptText).then(
    redirectUrl => {
      resolved = true;
      return redirectUrl;
    }
  );
  const [subject] = await observeTopic;

  subject.wrappedJSObject.loaded(window, webProgress);
  await TestUtils.waitForTick();
  ok(webProgress.listener, "Progress listener added");
  equal(window.document.title, promptText, "Window title set");

  const intermediate = "https://intermediate.example.com/";
  webProgress.listener.onStateChange(
    webProgress,
    {
      name: intermediate,
    },
    Ci.nsIWebProgressListener.STATE_START,
    null
  );
  ok(webProgress.listener);
  ok(!resolved);

  const completionUrl = InteractiveBrowser.COMPLETION_URL + "/test?code=asdf";
  webProgress.listener.onStateChange(
    webProgress,
    {
      name: completionUrl,
    },
    Ci.nsIWebProgressListener.STATE_START
  );

  const redirectedUrl = await request;
  ok(resolved, "Redirect complete");
  equal(redirectedUrl, completionUrl);

  ok(!webProgress.listener);
  ok(window.closed);
});

add_task(async function test_waitForRedirectOnStateChangeStart() {
  const url = "https://example.com";
  const promptText = "lorem ipsum";
  const { window, webProgress } = getRequestStubs();

  const observeTopic = TestUtils.topicObserved("browser-request");
  let resolved = false;
  const request = InteractiveBrowser.waitForRedirect(url, promptText).then(
    redirectUrl => {
      resolved = true;
      return redirectUrl;
    }
  );
  const [subject] = await observeTopic;

  subject.wrappedJSObject.loaded(window, webProgress);
  await TestUtils.waitForTick();
  ok(webProgress.listener, "Progress listener added");
  equal(window.document.title, promptText, "Window title set");

  const intermediate = "https://intermediate.example.com/";
  webProgress.listener.onStateChange(
    webProgress,
    {
      name: intermediate,
    },
    Ci.nsIWebProgressListener.STATE_IS_NETWORK,
    null
  );
  ok(webProgress.listener);
  ok(!resolved);

  const completionUrl = InteractiveBrowser.COMPLETION_URL + "/test?code=asdf";
  webProgress.listener.onStateChange(
    webProgress,
    {
      name: completionUrl,
    },
    Ci.nsIWebProgressListener.STATE_IS_NETWORK
  );

  const redirectedUrl = await request;
  ok(resolved, "Redirect complete");
  equal(redirectedUrl, completionUrl);

  ok(!webProgress.listener);
  ok(window.closed);
});

add_task(async function test_waitForRedirectCancelled() {
  const url = "https://example.com";
  const promptText = "lorem ipsum";
  const observeTopic = TestUtils.topicObserved("browser-request");
  const request = InteractiveBrowser.waitForRedirect(url, promptText);
  const [subject] = await observeTopic;

  subject.wrappedJSObject.cancelled();

  await rejects(request, CancelledError);
});

add_task(async function test_waitForRedirectImmediatelyAborted() {
  const url = "https://example.com";
  const promptText = "lorem ipsum";
  const { window, webProgress } = getRequestStubs();

  const observeTopic = TestUtils.topicObserved("browser-request");
  const request = InteractiveBrowser.waitForRedirect(url, promptText);
  const [subject] = await observeTopic;

  subject.wrappedJSObject.loaded(window, webProgress);
  subject.wrappedJSObject.cancelled();
  await TestUtils.waitForTick();
  ok(!webProgress.listener);

  await rejects(request, CancelledError);
});

add_task(async function test_waitForRedirectAbortEvent() {
  const url = "https://example.com";
  const promptText = "lorem ipsum";
  const { window, webProgress } = getRequestStubs();

  const observeTopic = TestUtils.topicObserved("browser-request");
  const request = InteractiveBrowser.waitForRedirect(url, promptText);
  const [subject] = await observeTopic;

  subject.wrappedJSObject.loaded(window, webProgress);
  await TestUtils.waitForTick();
  ok(webProgress.listener);
  equal(window.document.title, promptText);

  subject.wrappedJSObject.cancelled();
  await rejects(request, CancelledError);
  ok(!webProgress.listener);
  ok(window.closed);
});

add_task(async function test_waitForRedirectAlreadyArrived() {
  const url = "https://example.com";
  const completionUrl = InteractiveBrowser.COMPLETION_URL + "/test?code=asdf";
  const promptText = "lorem ipsum";
  const { window, webProgress } = getRequestStubs();
  window.initialURI = completionUrl;

  const observeTopic = TestUtils.topicObserved("browser-request");
  let resolved = false;
  const request = InteractiveBrowser.waitForRedirect(url, promptText).then(
    redirectUrl => {
      resolved = true;
      return redirectUrl;
    }
  );
  const [subject] = await observeTopic;

  subject.wrappedJSObject.loaded(window, webProgress);
  const redirectedUrl = await request;

  equal(window.document.title, promptText, "Window title set");
  ok(resolved, "Redirect complete");
  equal(redirectedUrl, completionUrl);

  ok(!webProgress.listener);
  ok(window.closed);
});

function getRequestStubs() {
  const mocks = {
    window: {
      close() {
        this.closed = true;
      },
      document: {
        getElementById() {
          return {
            currentURI: {
              spec: mocks.window.initialURI,
            },
          };
        },
      },
      initialURI: "",
    },
    webProgress: {
      addProgressListener(listener) {
        this.listener = listener;
      },
      removeProgressListener(listener) {
        if (this.listener === listener) {
          delete this.listener;
        }
      },
    },
  };
  return mocks;
}
