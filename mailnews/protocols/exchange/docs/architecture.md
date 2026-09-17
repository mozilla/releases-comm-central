# Code architecture for Exchange protocols

## General architecture

Exchange protocols are mostly implemented in a mix of C++ and Rust. Concepts and
operations defined globally in Thunderbird, such as its representation of
folders and servers, its storage management or its local operations are
implemented in C++ in order to leverage existing implementations through
inheritance; whereas the protocol client itself, i.e. the component in charge of
communicating with the server, is implemented in Rust.

Both sides interact via
[XPCOM](https://firefox-source-docs.mozilla.org/xpcom/index.html). One advantage
of this technical separation is that it creates a concrete boundary between
Thunderbird-specific concepts and implementations, and more generic code that
should only care about talking with the server (e.g. the protocol client should
not be aware of how messages are stored locally).

A summarised representation of this architecture can be seen below:

![An overview of the architecture, starting with the C++ class (folder, incoming
server, etc.) and followed by a visual description of the Rust protocol clients'
components](exchange_architecture.svg)

## The protocol client

When code wishes to interact with an Exchange server, it most often asks the
relevant `ExchangeIncomingServer` for an `IExchangeClient`. The incoming server
keeps a reference to a single client (or instantiates a new one if it doesn't
have one), which is reused throughout the server's lifetime. Clients are
instantiated over XPCOM, the contract ID used for this differs based on the
protocol we want a client for (e.g. the contract ID to build an EWS client is
`@mozilla.org/messenger/ews-client;1`).

On the Rust side of things we find three main crates for implementing protocol
clients:

* `ews_xpcom` and `graph_xpcom` provide the protocol clients for, respectively,
  EWS and the Microsoft Graph API, and
* `protocol_shared` provides generic protocol client data structures that can be
  used by the aforementioned crates.

`*_xpcom` crates implement the `IExchangeClient` via their respective "bridge"
structs (e.g. `XpcomEwsBridge`). These structs are meant to provide a simple
interface layer between the synchronous XPCOM methods and the asynchronous of
their `*_xpcom::client::XpCom{Protocol}Client` structs (which are the actual
protocol client implementations). Bridge structs keep a reference to a single
`Client` instance each (built during `IExchangeClient::Initialize`), and
dispatch asynchronous method calls via the `moz_task` helper crate.

The architecture of an `*_xpcom` crate is fairly simple, and mostly consists of:

* the bridge struct at the crate's root
* protocol-specific errors in the `error` module
* an outgoing server constructor in the `outgoing` module (we'll get to this
later)
* the protocol client in the `client` module, with each operation as a submodule

Specific protocols might require additional functionality on top of this, such
as EWS's server version handling.

The `client` module revolves around a single protocol client struct (e.g.
`XpComEwsClient` for EWS). This struct implements protocol-specific logic, such
as defining what request to send, and how to parse and validate responses, and
depends on the `OperationQueue` and `OperationSender` to perform those requests.

## The operation queue

Clients want to send requests in an orderly and controllable way; as a result
all operations are queued through an `OperationQueue` (from our
[operation-queue](https://crates.io/crates/operation-queue) crate), which is
unique per client. When started, this queue creates a number of "runners", which
are small structs that run infinite loops until they get a shutdown signal.
Runners run asynchronously on the main thread (and are dispatched via
`moz_task`).

Internally, the queue uses an MPMC (Multi-Producer, Multi-Consumer) channel from
the [async-channel](https://crates.io/crates/async-channel) to dispatch
operations to runners. This channel also acts as the queue's internal buffer,
and each runner's loop waits for a new operation to arrive so it can perform it
asynchronously.

Flexibility is made possible via the `operation_queue::QueuedOperation` trait;
any operation we want to queue only need to implement an asynchronous `perform`
method that is called by the runner. Each `*_xpcom` crate provides its own
`QueuedOperation` implementation, which `perform` implementation typically
serializes the operation into an `http::Request<Vec<u8>>` and hands it over to
the client's `OperationSender`.

<div class="note"><div class="admonition-title">Note</div>

The `QueuedOperation` trait allows runners to stay generic, as it is the trait
implementation that contains all the protocol-specific logic. This document only
covers Exchange protocols, which are all HTTP-based and use the same
`OperationSender` struct, but as a thought experiment we could imagine using
this queue for IMAP operations where an equivalent IMAP operation sender is able
to e.g. direct traffic to the connection with the right `SELECT`ed folder.

</div>

## The operation sender

The `OperationSender` from the `protocol_shared` crate is the generic component
that is responsible for sending HTTP(S) requests via Necko (Firefox's networking
component) and for handling generic HTTP error cases such as issues with
authentication, transport security or rate-limiting. Each client instantiates
and reuses a single `OperationSender`, and shares ownership of it with
`QueuedOperation` implementations through a smart pointer (`Arc`, in this case).

The use of Necko here is very intentional, for a few important reasons:

* We don't introduce a parallel HTTP stack, and instead can centralize HTTP
  traffic across the entirety of Thunderbird
* Network control settings we inherit from Firefox work out of the box for new
  HTTP protocols
* The HTTP traffic can be easily visualised in the developer tools

The outline of `OperationSender` is fairly straightforward. Consumers call its
`send_request` method with the `Request` and some additional data to help with
logging as well as informing the `OperationSender`'s behaviour when handling
errors. The `OperationSender` then turns the `http::Request` into a `moz_http`
request and sends it via the `send_request` module.

### Error handling

Once a response is received, the `OperationSender` performs a few additional
checks (in order):

1. Whether Necko reports a connection or transport security failure, or if the
  request reports an authentication failure
2. Whether the request's status is an error (i.e a non-2XX)
3. Whether the request contains a protocol-specific error

If one of these steps fail in an unrecoverable way, `send_request` errors right
away.

`*_xpcom` crates can influence this behavior by implementing the
`protocol_shared::ResponseProcessor` trait, and passing their implementation to
`send_request`. Implementations are called in step 3 with the raw response,
which they can inspect for protocol-specific errors. In addition to this,
implementations of this trait can let the `OperationSender` know that specific
non-2XX response statuses should be handled in a protocol-specitic manner.

Because the operation queue's runners perform operations independently from each
other, synchronization within the `OperationSender` is needed to handle some
specific error cases. For example, a request being sent while another is waiting
to be retried after being rate-limited can cause rate limits to take longer to
clear. This synchronization is done via [the `Line`
struct](https://docs.rs/operation-queue/latest/operation_queue/line_token/struct.Line.html),
also from the operation-queue crate.

The error cases in which synchronization is necessary are:

* authentication failures
* rate-limiting/throttling

These are errors which simultaneous independent requests would make more
difficult to process, and which typically affect more than just the request
being performed (e.g. an authentication failure will keep happening unless we
get new credentials).

The `OperationSender` (which is shared across all runners) holds a single
instance of `Line`. Upon encountering one of these errors, it tries to query the
line by calling its `try_acquire_token` method. This results in one of the
following outcomes:

* The line's token is available, in which case `try_acquire_token` returns a
  `Token`. The error is handled accordingly (e.g. by waiting for a given amount
  of time, or prompting the user to authenticate again), and retried if
  necessary. When the `Token` is dropped (from `send_request` returning), it
  automatically frees up the line.
* The token for the line has already been acquired by another runner calling
  `send_request`, in which case `try_acquire_token` returns a `Future` that the
  consumer can `await`. This `Future` resolves when the line gets freed up, at
  which point the current request should be retried right away because the error
  has been taken care of by the other runner (e.g. by waiting long enough, or
  refreshing the account's authentication credentials).

## Authentication

There are currently three supported authentication methods for HTTP-based email
protocols:

* Basic authentication (represented by `nsMsgAuthMethod::passwordCleartext`)
* NTLM (represented by `nsMsgAuthMethod::NTLM`)
* OAuth2 (represented by `nsMsgAuthMethod::OAuth2`)

### Password-based authentication

Basic and NTLM authentication is delegated to Necko's HTTP authentication
support. We do this by setting and maintaining entries in Necko's authentication
cache, via `nsIHttpAuthManager` and `nsIHttpAuthCache`.

Entries in Necko's authentication cache for HTTP-based email protocols are
managed by the `HttpAuthCacheManager` struct from `protocol_shared`. This struct
can only be used on the main thread, via a single thread-local static instance
(exposed as `AUTH_CACHE_MANAGER`).

<div class="note"><div class="admonition-title">Note</div>

Although we try to avoid using globals (even limited to a single thread) in this
part of the code base, it is necessary here so we can keep our own records of
existing cache entries for each server.

We need this record so we can invalidate cache entries whenever relevant,
because we wouldn't be able to find the correct entry for a server from the
cache itself *after* its authentication settings have changed (which is
generally the point at which we get notified).

</div>

The cache is updated in three categories of events:

1. When a server's client is created (shortly after startup, or as a result of
   an account being created)
2. When a server's authentication settings change
3. When a server is being removed (at shutdown, or when removing an account)

Cases 1 and 3 are handled when constructing and shutting down an
`OperationSender`.

Case 2 is handled by the `HttpAuthObserver` struct from the `protocol_shared`
crate. This observer is created once for each server, and is notified of the
following events:

* Updates to the password manager
* Updates to the server's in-memory password (which might differ from the
  password stored in the password manager, e.g. if a user was prompted for a new
  password but didn't tick the "Use Password Manager to remember this password"
  checkbox)
* Updates to the server's authentication-related properties

When specifically reacting to an update to the password manager, the observer
checks whether the parameters of the entry that was changed match the current
server.

### OAuth2

OAuth2 is handled via the same `msgIOAuth2Module` interface that other protocols
use. A new module is instantiated and queried on every request, and the
resulting token is passed to the `send_request` module so it can include it in
the request's `Authorization` header.

As users can override OAuth2 settings to match their organization's, the
`IExchangeLanguageInteropFactory` interface is used to gather this custom
configuration in an `IOAuth2CustomDetails` (implemented in C++ by
`ExchangeOAuth2CustomDetails`), which is provided to the OAuth2 module.

## Outgoing servers

Because of Thunderbird's existing architecture, outgoing servers are created and
implemented separately from incoming servers. A common implementation,
`OutgoingServer` exists in the `outgoing` module of the `protocol_shared` crate.
This implementation is instantiated by a protocol-specific function that is
exposed over FFI (so that XPCOM can expose it to other languages), such as
`ews_xpcom::outgoing::nsEwsOutgoingServerConstructor` for EWS.

When this function is called, a new `OutgoingServer` is instantiated with a
closure that allows it to create its protocol client when needed. The reason for
this kind of awkward approach is that a client usually needs a reference on the
server (so it can query its settings as necessary) but a server also needs a
reference on its client (so it can perform operations). So rather than create
both at the same time (which isn't possible), we let the `OutgoingServer` know
how to create a client, and give it a reference to itself, when needed.

## Rust traits for servers

The Rust crates define a few traits that provide a generic way of interacting
with both incoming and outgoing servers:

* `AuthenticationProvider` from `protocol_shared` defines methods for querying
  authentication settings from a server.
* `PrefBasedServer` from `protocol_shared` defines methods for setting and
  querying server properties from their prefs, as well as observing changes to a
  server's property.
* `UserInteractiveServer` from `mailnews_ui_glue` defines methods for triggering
  user-facing changes, such as prompting for a password or triggering a
  notification.

These traits are all implemented for both `nsIMsgIncomingServer` and
`nsIMsgOutgoingServer`. The `protocol_shared` crate also provides a shorthand
trait `ServerType` which combines all three of them (as well as `xpcom`'s
`RefCounted` trait, to make it compatible with `RefPtr`).
