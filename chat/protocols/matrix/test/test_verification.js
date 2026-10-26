/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { startVerification } = ChromeUtils.importESModule(
  "resource:///modules/matrixAccount.sys.mjs"
);
const { VerificationMethod } = ChromeUtils.importESModule(
  "resource:///modules/matrix-sdk.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { VerificationPhase, VerifierEvent } = MatrixSDK.Crypto;

const sandbox = sinon.createSandbox();
registerCleanupFunction(() => sandbox.restore());

const CHANGE_EVENT = MatrixSDK.Crypto.VerificationRequestEvent.Change;

const EMOJI_SAS = {
  emoji: [
    ["🐶", "dog"],
    ["🐱", "cat"],
  ],
};
const DECIMAL_SAS = {
  decimal: [1234, 5678, 9012],
};

/**
 * Mock of the SAS verifier, which doubles as the ShowSas event.
 */
class MockVerifier extends MatrixSDK.TypedEventEmitter {
  constructor(sas) {
    super();
    this.sas = sas;
    this.verify = sandbox.spy(() => {
      Promise.resolve().then(() => {
        this.emit(VerifierEvent.ShowSas, this);
      });
    });
    this.confirm = sandbox.spy();
    this.mismatch = sandbox.spy();
    this.cancel = sandbox.spy();
  }
}

/**
 * Create a mocked verification request.
 *
 * @param {object} [options] - Options.
 * @param {boolean} [options.initiatedByMe=false] - Did we initiate the request.
 * @param {number} [options.phase=VerificationPhase.Requested] - Initial phase.
 * @param {MockVerifier?} [options.verifier=null] - Initial verifier.
 * @param {boolean} [options.supportsMethod=true] - Does the other party
 *   support SAS verification.
 * @returns {object} Mocked verification request.
 */
function makeRequest({
  initiatedByMe = false,
  phase = VerificationPhase.Requested,
  verifier = null,
  supportsMethod = true,
} = {}) {
  const request = new MatrixSDK.TypedEventEmitter();
  request.initiatedByMe = initiatedByMe;
  request.phase = phase;
  request.verifier = verifier;
  request.accept = sandbox.stub().callsFake(async () => {
    request.phase = VerificationPhase.Ready;
  });
  request.otherPartySupportsMethod = sandbox
    .stub()
    .callsFake(() => supportsMethod);
  request.startVerification = sandbox.stub().callsFake(async () => {
    request.verifier = new MockVerifier(EMOJI_SAS);
    request.phase = VerificationPhase.Started;
    request.emit(CHANGE_EVENT);
  });
  return request;
}

add_task(async function test_incoming_sas() {
  const request = makeRequest({ initiatedByMe: false });
  const result = await startVerification(request);

  deepEqual(
    request.startVerification.firstCall.args,
    [VerificationMethod.Sas],
    "SAS is chosen for incoming requests."
  );
  ok(request.verifier.verify.calledOnce, "The verifier was started.");
  equal(result.challenge, "🐶 🐱", "The emoji challenge is joined as text.");
  equal(
    result.challengeDescription,
    "dog cat",
    "The emoji descriptions are joined."
  );

  result.handleResult(true);
  ok(request.verifier.confirm.calledOnce, "The challenge match was confirmed.");
  result.handleResult(false);
  ok(request.verifier.mismatch.calledOnce, "The mismatch was reported.");

  result.cancel();
  ok(request.verifier.cancel.calledOnce, "Cancellation was forwarded.");
});

add_task(async function test_incoming_cancelled_during_accept() {
  const request = makeRequest({ initiatedByMe: false });
  request.accept = sandbox.stub().callsFake(async () => {
    request.phase = VerificationPhase.Cancelled;
    request.emit(CHANGE_EVENT);
  });
  await Assert.rejects(
    startVerification(request),
    /verification aborted/,
    "Cancelling during accept aborts the verification."
  );
});

add_task(async function test_incoming_unsupported_method() {
  const request = makeRequest({ initiatedByMe: false, supportsMethod: false });
  await Assert.rejects(
    startVerification(request),
    /Unable to negotiate a verification method/,
    "An unsupported method is rejected."
  );
});

add_task(async function test_outgoing_waits_for_start() {
  const request = makeRequest({ initiatedByMe: true });
  // Simulate the other device starting the verification.
  Promise.resolve().then(() => {
    request.verifier = new MockVerifier(EMOJI_SAS);
    request.phase = VerificationPhase.Started;
    request.emit(CHANGE_EVENT);
  }, 10);
  const result = await startVerification(request);
  equal(result.challenge, "🐶 🐱", "The emoji challenge is joined as text.");
  ok(request.startVerification.notCalled, "The method is never chosen.");
});

add_task(async function test_outgoing_cancelled_while_waiting() {
  const request = makeRequest({ initiatedByMe: true });
  Promise.resolve().then(() => {
    request.phase = VerificationPhase.Cancelled;
    request.emit(CHANGE_EVENT);
  });
  await Assert.rejects(
    startVerification(request),
    /verification aborted/,
    "Cancelling while waiting aborts the verification."
  );
});

add_task(async function test_outgoing_already_cancelled() {
  // Already cancelled requests must reject instead of waiting forever.
  const request = makeRequest({
    initiatedByMe: true,
    phase: VerificationPhase.Cancelled,
  });
  await Assert.rejects(
    startVerification(request),
    /verification aborted/,
    "An already cancelled request is rejected."
  );
});

add_task(async function test_decimal_challenge() {
  const request = makeRequest({
    initiatedByMe: true,
    phase: VerificationPhase.Started,
    verifier: new MockVerifier(DECIMAL_SAS),
  });
  const result = await startVerification(request);
  equal(
    result.challenge,
    "1234 5678 9012",
    "The decimal challenge is joined as text."
  );
  equal(
    result.challengeDescription,
    undefined,
    "No description for a decimal challenge."
  );
});

add_task(async function test_unknown_method() {
  const verifier = new MockVerifier({});
  const request = makeRequest({
    initiatedByMe: true,
    phase: VerificationPhase.Started,
    verifier,
  });
  await Assert.rejects(
    startVerification(request),
    /unknown verification method/,
    "An unknown method is rejected."
  );
  ok(verifier.cancel.calledOnce, "The unknown method cancels the verifier.");
});
