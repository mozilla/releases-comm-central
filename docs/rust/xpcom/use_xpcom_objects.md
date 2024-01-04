# Instantiating and using objects through XPCOM in Rust

Thunderbird supports using Rust code to instantiate and manipulate objects
defined in other programming languages, such as C++ and JavaScript, using XPCOM.


## The `xpcom` crate

The `xpcom` crate provides various helpers for defining and using objects
through XPCOM.

On top of providing macros and decorators to define implementations of
interfaces (see [](implement_an_interface.md)), this crate also exposes all
interfaces available through XPCOM under `xpcom::interfaces`, as well as the
same `create_instance()` and `get_service()` functions that are also available
in other languages.


## References on new instances or existing services

In order to create a new instance of an object or retrieve an instance of an
existing service, two elements are needed:

* the interface implemented by the object being created/retrieved
* the contract ID for the object being created/retrieved

For example, getting a reference on an instance of `nsIIOService` looks like
this:

```rust
use cstr::cstr;

use xpcom::interfaces::nsIIOService;

let io_srv = xpcom::get_service::<nsIIOService>(cstr!(
    "@mozilla.org/network/io-service;1"
));
```

The type for the return value of `get_service` here is an `Option` which, once
unwrapped, should resolve to `xpcom::RefPtr<nsIIOService>`, which exposes all
the member fields and methods described in the `nsIIOService` interface.

Similarly, to create a new instance of `nsIStringInputStream`, we would do:

```rust
use cstr::cstr;

use xpcom::interfaces::nsIStringInputStream;

let stream = xpcom::create_instance::<nsIStringInputStream>(cstr!(
    "@mozilla.org/io/string-input-stream;1"
));
```

Here as well, the type for the return value of `create_instance` is
`Option<xpcom::RefPtr<nsIStringInputStream>>`.

Note that both `xpcom::get_service` and `xpcom::create_instance` require the
contract ID to be passed as a `&CStr`, which we do here using the
[cstr](https://crates.io/crates/cstr) crate.


## Calling methods on XPCOM objects

Calling a method on an XPCOM object is always unsafe, as the Rust compiler
cannot guarantee that the ownership rules are enforced across a language
boundary. Calling a method defined by an XPCOM interface must therefore always
happen within an `unsafe` block.


### Handling output with `getter_addrefs`

Handling the output of an XPCOM method can sometimes be a little tricky, as it
involves manipulating and refcounting raw pointers as output parameter (e.g.
`out` parameters or return values in XPIDL files), in a way that doesn't always
work nicely with more idiomatic Rust code (or at least requires a good amount of
boilerplate).

To help with this, the `xpcom` crate provides a `getter_addrefs` function. This
function takes a lambda as its argument, which is given a mutable raw pointer
which can be passed down to the XPCOM method, and returns a refcounted reference
to the data that was returned by the call. For example, here is how we would
call `nsIScriptSecurityManager::GetSystemPrincipal()` to ge the `nsIPrincipal`
for the system:

```rust
use nserror::nsresult;
use xpcom::{get_service, getter_addrefs, RefPtr};
use xpcom::interfaces::{nsIPrincipal, nsIScriptSecurityManager};

fn retrieve_principal() -> Result<(), nsresult> {
    let script_sec_mgr: RefPtr<nsIScriptSecurityManager> =
        get_service::<nsIScriptSecurityManager>(cstr!("@mozilla.org/scriptsecuritymanager;1"))
            .ok_or(nserror::NS_ERROR_FAILURE)?;

    let principal: RefPtr<nsIPrincipal> =
        getter_addrefs(unsafe { |p| script_sec_mgr.GetSystemPrincipal(p) })?;

    Ok(())
}
```


### Mapping return values of XPCOM methods

Most XPCOM methods return an instance of `nserror::nsresult`, which can indicate
either an error or a success. Needing to manually map this to determine whether
the operation failed can be cumbersome. To help, the `nserror::nsresult` type
implements a handful of helpful methods:

* `to_result()` turns the `nsresult` into a `Result<(), nsresult>`, which is an
  error if the status represented by the initial return value is a failure.
* `failed()`/`succeeded()` indicates whether the result is a failure or a
  success, respectively.
* `error_name()` returns the error's name as an `nsCString`, which can be logged
  for debugging.


## Casting between XPCOM interfaces

To account for Rust's lack of inheritance, XPCOM objects come with a few methods
implemented into them to help either translating the object into a subtype of
the interface it implements, or one of its base interfaces.

The `query_interface()` method (which comes from the `xpcom::XpCom` trait), just
like its C++ and JavaScript counterparts, allows casting an object into the
provided interface if possible, and returns an `Option<RefPtr<T>>` (where `T` is
the interface we want to cast to), which is `None` if the cast wasn't possible.
For example, to cast an `nsIChannel` as an `nsIHttpChannel`, we would do:

```rust
let http_channel = channel.query_interface::<nsIHttpChannel>().unwrap();
```

Additionally, the `coerce()` method allows casting an object into one of its
base classes. For example, to cast an `nsIImapMockChannel` as an `nsIChannel`,
one could do:

```rust
let channel: RefPtr<nsIImapMockChannel> = imap_channel.coerce();
```

`coerce()` is also helpful when the translation needed is between types of
pointers. For example, to use an `nsIIOService` to create a new channel via
`NewChannel`, we would do:

```rust

fn create_channel(principal: RefPtr<nsIPrincipal>) -> Result<RefPtr<nsIChannel>, nsresult> {
    let url: RefPtr<nsIURI> = ...;
    let io_srv: RefPtr<nsIIOService> = ...;

    let channel: RefPtr<nsIChannel> = getter_addrefs(|p| unsafe {
        io_srv.NewChannel(
            url,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            principal.coerce(),  // Coercing from RefPtr<nsIPrincipal> to *const nsIPrincipal
            ptr::null(),
            nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
            nsIContentPolicy::TYPE_OTHER,
            p,
        )
    })?;
}
```