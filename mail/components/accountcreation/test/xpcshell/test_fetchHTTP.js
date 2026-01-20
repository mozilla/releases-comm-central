/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);
const { setTimeout, clearTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { CommonUtils } = ChromeUtils.importESModule(
  "resource://services-common/utils.sys.mjs"
);

const { fetchHTTP } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FetchHTTP.sys.mjs"
);

const mockServer = {
  expectedRequests: [],
  requests: [],
  delayedResponses: [],

  /**
   * Initialize the mock server, including a HTTP server at http://test.test and a HTTPS variant at https://test.test.
   */
  async init() {
    this.server = new HttpServer();
    this.server.start(-1);
    this.server.identity.add("http", "test.test", 80);
    this.server.identity.add("https", "test.test", 443);
    NetworkTestUtils.configureProxy(
      "test.test",
      80,
      this.server.identity.primaryPort
    );
    this.secureProxy = await HttpsProxy.create(
      this.server.identity.primaryPort,
      "valid",
      "test.test"
    );
    this.reset();
  },

  /**
   * Register an expected request. Can currently only handle one request per
   * path.
   *
   * @param {object} requestInfo
   * @param {string} requestInfo.path - The request path on the server.
   * @param {string} requestInfo.method - The request method.
   * @param {string} [requestInfo.body] - The body of the request.
   * @param {string} [requestInfo.queryString=""] - Optional query string.
   * @param {object} [requestInfo.headers={}] - Expected headers, if any.
   * @param {string} [requestInfo.responseData] - The data to respond to the request with.
   * @param {object} [requestInfo.responseHeaders={}] - Headers to set on the response.
   * @param {number} [requestInfo.responseCode=200] - The code to respond with.
   * @param {number} [requestInfo.delayResponseBy=0] - If the response should be delayed by the given amount of ms. If 0 a response is immediately returned.
   */
  expectRequest({
    path,
    method,
    body,
    queryString = "",
    headers = {},
    responseData,
    responseHeaders = {},
    responseCode = 200,
    delayResponseBy = 0,
  }) {
    const headerEntries = Object.entries(headers);
    const responseHeaderEntries = Object.entries(responseHeaders);
    this.expectedRequests.push({
      path,
      method,
      queryString,
      headers,
      body,
    });
    this.server.registerPathHandler(path, (request, response) => {
      this.requests.push(request);
      info(
        `${request.method} request to ${request.path}?${request.queryString}`
      );
      if (request.method === "POST" && body) {
        request.bodyString = CommonUtils.readBytesFromInputStream(
          request.bodyInputStream
        );
      }
      if (
        request.method === method &&
        request.queryString == queryString &&
        headerEntries.every(
          ([header, value]) => request.getHeader(header) === value
        ) &&
        (!body || request.bodyString == body)
      ) {
        response.setStatusLine(request.httpVersion, responseCode, "OK");
        for (const [header, value] of responseHeaderEntries) {
          response.setHeader(header, value);
        }
        if (responseData) {
          response.write(responseData);
        }
        if (delayResponseBy > 0) {
          response.seizePower();
          this.delayedResponses.push(
            /* eslint-disable mozilla/no-arbitrary-setTimeout */
            setTimeout(() => {
              response.finish();
            }, delayResponseBy)
            /* eslint-enable mozilla/no-arbitrary-setTimeout */
          );
        }
        return;
      }
      response.setStatusLine("1.1", 404, "Not Found");
    });
  },

  /**
   * Check that all seend requests exactly match the expected requests. Only
   * useful if the registration order of expected requests matches the actual
   * order and there are no duplicate requests to the same path.
   */
  checkRequests() {
    Assert.equal(
      this.requests.length,
      this.expectedRequests.length,
      "Should have received as many requests as expected"
    );
    Assert.ok(
      this.expectedRequests.every((expectedRequest, index) => {
        const request = this.requests[index];
        return (
          request.path === expectedRequest.path &&
          request.method === expectedRequest.method &&
          request.queryString == expectedRequest.queryString &&
          Object.entries(expectedRequest.headers).every(
            ([header, value]) => request.getHeader(header) === value
          ) &&
          (!expectedRequest.body || request.bodyString == expectedRequest.body)
        );
      }),
      "Actual requests should match expected requests"
    );
  },

  /**
   * Reset the server handling state between tasks.
   */
  reset() {
    for (const expectedRequest of this.expectedRequests) {
      this.server.registerPathHandler(expectedRequest.path, null);
    }
    for (const delayedResponse of this.delayedResponses) {
      clearTimeout(delayedResponse);
    }
    this.requests = [];
    this.expectedRequests = [];
    this.delayedResponses = [];
  },

  cleanup() {
    this.secureProxy.destroy();
    this.server.stop();
  },
};

/**
 * Check if an error looks like a ServerException
 *
 * @param {Error} error - The error to check.
 * @param {number} code - The code number to expect.
 * @param {string} url - The URL the error should be thrown for.
 * @param {Error} [cause] - The cause of the error, if expected.
 * @returns {boolean} If the error looks like a ServerException.
 */
function checkServerException(error, code, url, cause) {
  return (
    Error.isError(error) &&
    error.code == code &&
    error.uri == url &&
    error.url == url &&
    (!cause || error.cause === cause)
  );
}

add_setup(async () => {
  do_get_profile();
  await mockServer.init();
});

registerCleanupFunction(() => {
  mockServer.cleanup();
});

add_task(async function test_get() {
  mockServer.expectRequest({
    path: "/testget",
    method: "GET",
    responseData: "foo",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
  });

  const result = await fetchHTTP("http://test.test/testget");

  mockServer.checkRequests();
  Assert.equal(result, "foo", "Should get a response");

  mockServer.reset();
});

add_task(async function test_get_urlArgs() {
  mockServer.expectRequest({
    path: "/testget",
    method: "GET",
    queryString: "foo=b%C3%A4r&test=1&extra=lorem+ipsum",
    responseData: "foo",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
  });

  const result = await fetchHTTP("http://test.test/testget", {
    urlArgs: {
      foo: "bär",
      test: 1,
      extra: "lorem ipsum",
    },
  });

  mockServer.checkRequests();
  Assert.equal(result, "foo", "Should get a response");

  mockServer.reset();
});

add_task(async function test_get_headers() {
  mockServer.expectRequest({
    path: "/testget",
    method: "GET",
    headers: { Foo: "Bar" },
    responseData: "baz",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
  });

  const result = await fetchHTTP("http://test.test/testget", {
    headers: {
      Foo: "Bar",
    },
  });

  mockServer.checkRequests();
  Assert.equal(result, "baz", "Should get response");

  mockServer.reset();
});

add_task(async function test_get_authenticated() {
  mockServer.expectRequest({
    path: "/authenticated",
    method: "GET",
    headers: { Authorization: "Basic Zm9vOmJhcg==" },
    responseData: "Success",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
  });

  const result = await fetchHTTP("http://test.test/authenticated", {
    username: "foo",
    password: "bar",
  });

  mockServer.checkRequests();
  Assert.equal(result, "Success", "Should get secret response");

  mockServer.reset();
});

add_task(async function test_get_responseJSON() {
  const testData = {
    foo: "bar",
    lorem: {
      ipsum: {
        dolor: {
          sit: ["amet"],
        },
      },
    },
    one: 1,
  };
  mockServer.expectRequest({
    path: "/json",
    method: "GET",
    responseData: JSON.stringify(testData),
    responseHeaders: {
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  mockServer.expectRequest({
    path: "/textjson",
    method: "GET",
    responseData: JSON.stringify(testData),
    responseHeaders: {
      "Content-Type": "text/json; charset=UTF-8",
    },
  });

  const applicationJSON = await fetchHTTP("http://test.test/json");
  const textJSON = await fetchHTTP("http://test.test/textjson");

  mockServer.checkRequests();
  Assert.deepEqual(
    applicationJSON,
    testData,
    "Should decode correct JSON data with application/json mimem type"
  );
  Assert.deepEqual(
    textJSON,
    testData,
    "Should decode correct JSON data with text/json mime type"
  );

  mockServer.reset();
});

add_task(async function test_get_responseXML() {
  const xml = "<foo>bar</foo>";
  const xmlJXON = { foo: "bar", $foo: ["bar"] };
  mockServer.expectRequest({
    path: "/textxml",
    method: "GET",
    responseData: xml,
    responseHeaders: {
      "Content-Type": "text/xml; charset=UTF-8",
    },
  });
  mockServer.expectRequest({
    path: "/appxml",
    method: "GET",
    responseData: xml,
    responseHeaders: {
      "Content-Type": "application/xml; charset=UTF-8",
    },
  });

  const textXML = await fetchHTTP("http://test.test/textxml");
  const applicationXML = await fetchHTTP("http://test.test/appxml");

  mockServer.checkRequests();

  Assert.deepEqual(
    textXML,
    xmlJXON,
    "Should return expected JXON for text/xml mime type"
  );
  Assert.deepEqual(
    applicationXML,
    xmlJXON,
    "Should return expected JXON for application/xml mime type"
  );

  mockServer.reset();
});

add_task(async function test_get_https() {
  mockServer.expectRequest({
    path: "/gettest",
    method: "GET",
    responseData: "hi",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
  });

  const result = await fetchHTTP("https://test.test/gettest");

  mockServer.checkRequests();
  Assert.equal(result, "hi", "Should get expected response over HTTPS");

  mockServer.reset();
});

add_task(async function test_get_responseDecodingError() {
  mockServer.expectRequest({
    path: "/invalidjson",
    method: "GET",
    responseData: "<!DOCTYPE html><html>invalid JSON</html>",
    responseHeaders: {
      "Content-Type": "text/json",
    },
  });

  await Assert.rejects(
    fetchHTTP("http://test.test/invalidjson"),
    error => checkServerException(error, -4, "http://test.test/invalidjson"),
    "Should reject when body can't be parsed"
  );
  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_get_serverError() {
  mockServer.expectRequest({
    path: "/server-error",
    method: "GET",
    responseData: "Oops",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
    responseCode: 501,
  });

  await Assert.rejects(
    fetchHTTP("http://test.test/server-error"),
    error => checkServerException(error, 501, "http://test.test/server-error"),
    "Should get the error returned by the server as a rejection"
  );
  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_get_abortSignal() {
  const abortController = new AbortController();
  const abortReason = new Error("test");
  abortController.abort(abortReason);

  mockServer.expectRequest({
    path: "/aborted",
    method: "GET",
    delayResponseBy: 6000,
  });

  await Assert.rejects(
    fetchHTTP("http://test.test/aborted", {
      signal: abortController.signal,
    }),
    error => error === abortReason,
    "Should immediately reject with the abort reason"
  );
  Assert.deepEqual(
    mockServer.requests,
    [],
    "Should not have registered any requests"
  );

  const secondAbortController = new AbortController();
  const inProgressFetch = fetchHTTP("http://test.test/aborted", {
    timeout: 9000,
    signal: secondAbortController.signal,
  });
  // Wait long enough for the request to have been started. In theory the abort
  // could also be triggered before the request is sent, but that's much
  // thougher timing.
  await TestUtils.waitForCondition(() => mockServer.requests.length > 0);
  secondAbortController.abort(abortReason);

  await Assert.rejects(
    inProgressFetch,
    error =>
      checkServerException(error, -2, "http://test.test/aborted", abortReason),
    "Should abort with the given reason"
  );
  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_get_timeout() {
  mockServer.expectRequest({
    path: "/aborted",
    method: "GET",
    delayResponseBy: 6000,
  });
  await Assert.rejects(
    fetchHTTP("http://test.test/aborted", {
      timeout: 100,
    }),
    error => checkServerException(error, -2, "http://test.test/aborted"),
    "Should reject due to the timeout"
  );
  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_get_redirect() {
  mockServer.expectRequest({
    path: "/redirect",
    method: "GET",
    headers: { Authorization: "Basic Zm9vOmJhcg==" },
    responseCode: 301,
    responseHeaders: {
      Location: "http://example.com/",
    },
  });

  await Assert.rejects(
    fetchHTTP("http://test.test/redirect", {
      username: "foo",
      password: "bar",
    }),
    error => checkServerException(error, -2, "http://example.com/"),
    "Should reject when redirecting"
  );
  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_get_offline() {
  mockServer.expectRequest({
    path: "/offline",
    method: "GET",
  });
  Services.io.offline = true;

  await Assert.rejects(
    fetchHTTP("http://test.test/offline"),
    error => checkServerException(error, -2, "http://test.test/offline"),
    "Should reject when offline"
  );

  Services.io.offline = false;
  Assert.deepEqual(
    mockServer.requests,
    [],
    "Should not have gotten any request on the server"
  );

  mockServer.reset();
});

add_task(async function test_post() {
  mockServer.expectRequest({
    path: "/post",
    method: "POST",
    responseData: "Updated",
    responseHeaders: {
      "Content-Type": "text/plain",
    },
  });

  const result = await fetchHTTP("http://test.test/post", {
    post: true,
  });

  mockServer.checkRequests();
  Assert.equal(result, "Updated", "Should get expected result");

  mockServer.reset();
});

add_task(async function test_post_xml() {
  const xml = "<foo>bar</foo>";
  mockServer.expectRequest({
    path: "/postxml",
    method: "POST",
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
    },
    body: xml,
  });
  mockServer.expectRequest({
    path: "/postxmlsimple",
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
    },
    body: xml,
  });
  const parser = new DOMParser();
  const parsedXML = parser.parseFromString(xml, "application/xml");

  await fetchHTTP("http://test.test/postxml", {
    post: true,
    uploadBody: parsedXML,
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
    },
  });
  info("Second request without headers");
  await fetchHTTP("http://test.test/postxmlsimple", {
    uploadBody: parsedXML,
  });

  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_post_json() {
  const uploadBody = { foo: "bar" };
  const json = JSON.stringify(uploadBody);
  mockServer.expectRequest({
    path: "/postjson",
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: json,
  });
  mockServer.expectRequest({
    path: "/postjsonsimple",
    method: "POST",
    headers: {
      "Content-Type": "text/json; charset=UTF-8",
    },
    body: json,
  });

  await fetchHTTP("http://test.test/postjson", {
    post: true,
    uploadBody,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  info("Second request without headers");
  await fetchHTTP("http://test.test/postjsonsimple", {
    uploadBody,
  });

  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_post_text() {
  const uploadBody = "lorem ipsum dolor sit amet";
  mockServer.expectRequest({
    path: "/postjson",
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
    body: uploadBody,
  });

  await fetchHTTP("http://test.test/postjson", {
    uploadBody,
  });

  mockServer.checkRequests();

  mockServer.reset();
});

add_task(async function test_post_arbitraryBody() {
  mockServer.expectRequest({
    path: "/postfunction",
    method: "POST",
    body: (() => {}).toString(),
  });

  await fetchHTTP("http://test.test/postfunction", {
    uploadBody: () => {},
  });

  mockServer.checkRequests();

  mockServer.reset();
});
