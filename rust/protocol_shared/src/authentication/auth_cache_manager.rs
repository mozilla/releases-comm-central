/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module provides a "manager" ([`HttpAuthCacheManager`]) struct which
//! acts as a proxy to the Necko HTTP authentication cache.
//!
//! This struct is meant to be used on the main thread only, through the
//! [`AUTH_CACHE_MANAGER`] static constant, to ensure all function calls use the
//! same instance and that the instance being used is capable of interacting
//! with Necko's cache.

use std::{cell::RefCell, collections::HashMap, fmt::Debug, ptr};

use nserror::{NS_ERROR_INVALID_ARG, NS_ERROR_NOT_AVAILABLE, NS_ERROR_UNEXPECTED, nsresult};
use nsstring::{nsCString, nsString};
use thin_vec::ThinVec;
use xpcom::{
    RefPtr, components,
    interfaces::{nsIHttpAuthCache, nsIHttpAuthEntry, nsIHttpAuthManager, nsMsgAuthMethod},
};

use crate::authentication::authentication_provider::{
    AuthenticationProvider, PasswordLocationForCache,
};

thread_local! {
    /// An instance of [`HttpAuthCacheManager`] that is reused by any other
    /// consumer on the main thread.
    ///
    /// It is lazily-constructed upon access, and its constructor will panic if
    /// the current thread isn't the main thread.
    pub(crate) static AUTH_CACHE_MANAGER: HttpAuthCacheManager = HttpAuthCacheManager::new();
}

/// The authentication settings for a server.
#[derive(Clone)]
struct ServerAuthIdentity {
    auth_type: String,
    scheme: String,
    realm: String,
    hostname: String,
    port: i32,
    domain: String,
    username: String,
    password: String,
}

/// An implementation of the [`Debug`] trait that does not leak account
/// passwords.
impl Debug for ServerAuthIdentity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServerAuthIdentity")
            .field("auth_type", &self.auth_type)
            .field("scheme", &self.scheme)
            .field("realm", &self.realm)
            .field("hostname", &self.hostname)
            .field("port", &self.port)
            .field("domain", &self.domain)
            .field("username", &self.username)
            .finish()
    }
}

impl ServerAuthIdentity {
    /// Generates a [`ServerAuthIdentity`] from any server that implements
    /// [`AuthenticationProvider`].
    fn from_server<T: AuthenticationProvider + ?Sized>(
        server: &T,
        pw_location: PasswordLocationForCache,
    ) -> Result<Option<ServerAuthIdentity>, nsresult> {
        let username = server.username()?.to_string();

        let (auth_type, domain, username) = match server.auth_method()? {
            nsMsgAuthMethod::NTLM => {
                // NTLM usernames might come in the form `domain\username`. Note
                // that they might also come in the form `username@domain`, but
                // this is done in order to work around the 15-character limit
                // for domain length and such usernames should be sent to the
                // server as is.
                let (domain, username) =
                    username.split_once('\\').unwrap_or(("", username.as_str()));

                ("ntlm", domain, username)
            }

            nsMsgAuthMethod::passwordCleartext => ("basic", "", username.as_str()),

            // Other authentication methods are either implemented on our side
            // or unsupported.
            _ => {
                log::debug!(
                    "not generating an auth identity for server with an auth method that isn't delegated to Necko"
                );
                return Ok(None);
            }
        };

        let realm = server.realm()?.to_string();

        let Some(url) = server.base_http_url()? else {
            log::error!("trying to generate an HTTP auth cache entry for server without a URL");
            return Err(NS_ERROR_UNEXPECTED);
        };

        // If the URL doesn't have a port, we need to set it to -1, which is the
        // default for `nsIURI`. We can't use `port_or_known_default()` because
        // a URL without an explicit port will match an entry with -1 but not
        // one with 80 or 443.
        let port = url.port().map_or(-1, i32::from);
        let scheme = url.scheme().to_string();

        let Some(hostname) = url.host() else {
            log::error!("invalid URL: missing hostname: {}", url.as_str());
            return Err(NS_ERROR_UNEXPECTED);
        };

        if matches!(pw_location, PasswordLocationForCache::Storage) {
            // In some cases, it is possible that the return value of
            // `server.password()` has not yet been updated to reflect the
            // password stored in the login manager. This can happen if the
            // `HttpAuthCacheManager` is called from an observer that is
            // notified before the server's own observer. Because of this, we
            // want to make the server forget its in-memory copy of the password
            // so it's read from storage.
            //
            // This can have the unfortunate side-effect of getting the password
            // read from storage twice in a row (e.g. in the observer case
            // described above), but it should be negligible considering updates
            // of authentication settings don't tend to happen often (and the
            // more automated ones, like when refreshing an OAuth2 token, should
            // have already been filtered out at this point).
            server.forget_session_password()?;
        }

        let password = server.password()?;

        let identity = ServerAuthIdentity {
            auth_type: auth_type.to_string(),
            scheme,
            realm,
            hostname: hostname.to_string(),
            port,
            domain: domain.to_string(),
            username: username.to_string(),
            password: password.to_string(),
        };

        Ok(Some(identity))
    }
}

/// A struct that acts as a proxy between the rest of the code and Necko's HTTP
/// authentication cache.
///
/// This struct's designs strongly relies on all of its code being synchronous,
/// and running on the same single thread (i.e. the main thread).
pub(crate) struct HttpAuthCacheManager {
    /// Our local map of server keys to cache entries. It's wrapped in a
    /// [`RefCell`] to provide interior mutability. Uses of `RefCell` should be
    /// fine here as long as [`HttpAuthCacheManager`]'s methods stay
    /// synchronous, and care is applied to ensure borrowing rules are followed.
    cache_entries: RefCell<HashMap<String, RefPtr<nsIHttpAuthEntry>>>,
}

impl HttpAuthCacheManager {
    /// Instantiates a new [`HttpAuthCacheManager`].
    ///
    /// Panics unless called on the main thread.
    fn new() -> HttpAuthCacheManager {
        assert!(
            moz_task::is_main_thread(),
            "HttpAuthCacheManager should not be constructed from outside the main thread"
        );

        HttpAuthCacheManager {
            cache_entries: Default::default(),
        }
    }

    /// Sets or updates the HTTP authentication cache entry for a given server.
    ///
    /// If the server doesn't use an authentication method that we delegate to
    /// Necko, this is a no-op.
    pub(super) fn add_or_update_cache<ServerT: AuthenticationProvider + ?Sized>(
        &self,
        server: &ServerT,
        pw_location: PasswordLocationForCache,
    ) -> Result<(), nsresult> {
        // Make sure we have a cache entry for the server.
        let Some(ident) = ServerAuthIdentity::from_server(server, pw_location)? else {
            // The server's auth method isn't delegated to Necko.
            return Ok(());
        };

        log::debug!("adding or updating Necko's auth cache : {ident:?}");

        let auth_manager: RefPtr<nsIHttpAuthManager> =
            xpcom::get_service(c"@mozilla.org/network/http-auth-manager;1")
                .ok_or(NS_ERROR_UNEXPECTED)?;

        // SAFETY: We've ensured the pointers we use here point to valid data. This
        // data is copied (via `ns[C]String::Assign`) before `SetAuthIdentity`
        // returns.
        unsafe {
            // Set the auth identity in Necko's auth cache. We need to make sure we
            // supply the same scheme, host and port (also path and realm, if
            // non-empty) that will be used in requests, otherwise we'll get a cache
            // miss.
            auth_manager.SetAuthIdentity(
                &raw const *nsCString::from(&ident.scheme),
                &raw const *nsCString::from(&ident.hostname),
                ident.port,
                // Note: we supply the auth type because the XPIDL has it (and
                // we know it), but the actual implementation ignores it.
                &raw const *nsCString::from(&ident.auth_type),
                &raw const *nsCString::from(&ident.realm),
                // We currently don't set a path, so that the auth cache entry
                // applies to the entire domain (for this scheme and username).
                // In the future, there might be edge cases in which setting a
                // path (e.g. the Graph subpath or EWS endpoint) is desirable,
                // but we can address those later on.
                &raw const *nsCString::new(),
                &raw const *nsString::from(&ident.domain),
                &raw const *nsString::from(&ident.username),
                &raw const *nsString::from(&ident.password),
                // Optional parameters.
                false,
                ptr::null(),
            )
        }
        .to_result()?;

        // Create a new item in our local map with the cache entry (or, if we
        // already had one, update it).
        let entry = find_cache_entry(ident)?;
        let key = server.key()?.to_string();
        self.cache_entries
            .borrow_mut()
            .insert(key.clone(), entry.clone());
        log::debug!("stored cache entry for server with key {key}");

        Ok(())
    }

    /// Remove the entry for the given server from Necko's authentication cache.
    ///
    /// If there isn't a cache entry associated with the server's entry in the
    /// [`HttpAuthCacheManager`]'s internal map, this is a no-op. This includes
    /// cases where the authentication cache is set directly with the
    /// `nsIHttpAuthManager` service rather than with [`add_or_update_cache`].
    ///
    /// [`add_or_update_cache`]: HttpAuthCacheManager::add_or_update_cache
    pub(super) fn remove_from_cache<ServerT: AuthenticationProvider + ?Sized>(
        &self,
        server: &ServerT,
    ) -> Result<(), nsresult> {
        let key = server.key()?.to_string();

        let Some(stale_entry) = self.cache_entries.borrow().get(&key).cloned() else {
            log::debug!("could not find a cache entry for server with key {key}");
            return Ok(());
        };

        log::debug!("found entry for key {key}");

        // If we're running with debug logs enabled, we also want to get
        // additional data about the cache entry we're removing.
        if log::max_level() >= log::Level::Debug {
            let mut realm = nsCString::new();
            let mut domain = nsString::new();
            let mut username = nsString::new();

            // SAFETY: Pointers refer to memory that has just been allocated and
            // stays alive throughout the function calls.
            unsafe { stale_entry.GetRealm(&raw mut *realm) }.to_result()?;
            unsafe { stale_entry.GetDomain(&raw mut *domain) }.to_result()?;
            unsafe { stale_entry.GetUser(&raw mut *username) }.to_result()?;

            log::debug!(
                "removing stale entry for server with key {key}: realm={realm}, domain={domain}, username={username}"
            );
        }

        // Remove the entry from Necko's cache.
        let cache = components::HttpAuthCache::service::<nsIHttpAuthCache>()?;

        // SAFETY: `stale_entry` is wrapped in a `RefPtr` which ensures the
        // inner `nsIHttpAuthEntry` is kept alive.
        match unsafe { cache.ClearEntry(stale_entry.coerce()) }.to_result() {
            Ok(()) => (),
            // `nsHttpAuthCacheManager` returns with `NS_ERROR_NOT_AVAILABLE` if
            // it cannot find the entry. This might be the case if e.g. incoming
            // and outgoing servers exist for the same account.
            //
            // We *could* go and find another entry to remove instead, but this
            // method is either called in the context of removing an account (in
            // which case the server associated with the cache entry will likely
            // get removed as well), or refreshing the cache entry for the
            // server (in which case we'll likely end up setting the right data
            // in the cache).
            Err(err) if err == NS_ERROR_NOT_AVAILABLE => (),
            Err(err) => return Err(err),
        }

        // Also remove it from our own map.
        self.cache_entries.borrow_mut().remove(&key);

        Ok(())
    }

    /// Invalidate all locally-tracked entries from the Necko authentication
    /// cache.
    ///
    /// If there are no entries that are locally-tracked (e.g. if all
    /// previously-known entries have already been cleared), this is a no-op.
    /// This means that if this method is called multiple times in quick
    /// succession (e.g. because multiple server-specific observers have
    /// received a "removeAllLogins" notification), only the first call will
    /// actually be doing anything (besides reading the length of the internal
    /// map of cache entries).
    pub(crate) fn clear_cache(&self) -> Result<(), nsresult> {
        if self.cache_entries.borrow().is_empty() {
            // The cache has already cleared, or we're not aware of any cache
            // entry on our end, so let's not do anything here.
            return Ok(());
        }

        // Invalidate locally-tracked entry from the cache. We could call
        // `nsIHttpAuthManager::ClearAll` here, but we want to limit
        // interference with other features (which should be in charge of
        // managing their own authentication).
        let cache = components::HttpAuthCache::service::<nsIHttpAuthCache>()?;
        for entry in self.cache_entries.borrow().values() {
            // SAFETY: `entry` is wrapped in a `RefPtr` which ensures the inner
            // `nsIHttpAuthEntry` is kept alive.
            unsafe { cache.ClearEntry(entry.coerce()) }.to_result()?;
        }

        // Also remove any entry we've been keeping track of, since they're not
        // valid anymore.
        self.cache_entries.borrow_mut().clear();

        Ok(())
    }
}

// Look through Necko's auth cache and try to find an entry that matches the
// given identity.
fn find_cache_entry(ident: ServerAuthIdentity) -> Result<RefPtr<nsIHttpAuthEntry>, nsresult> {
    let cache = components::HttpAuthCache::service::<nsIHttpAuthCache>()?;
    let mut entries = ThinVec::new();

    unsafe { cache.GetEntries(&raw mut entries) }.to_result()?;

    for entry in entries {
        // Ignore null pointers. They shouldn't happen, but it's not our problem
        // if they do.
        let Some(entry) = entry else {
            continue;
        };

        let mut realm = nsCString::new();
        let mut domain = nsString::new();
        let mut username = nsString::new();

        // SAFETY: Pointers refer to memory that has just been allocated and
        // stays alive throughout the function calls.
        unsafe { entry.GetRealm(&raw mut *realm) }.to_result()?;
        unsafe { entry.GetDomain(&raw mut *domain) }.to_result()?;
        unsafe { entry.GetUser(&raw mut *username) }.to_result()?;

        if realm.to_string() == ident.realm
            && domain.to_string() == ident.domain
            && username.to_string() == ident.username
        {
            return Ok(entry);
        }
    }

    Err(NS_ERROR_INVALID_ARG)
}
