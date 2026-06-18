import { U as K, C as $, d as A, u as T, a as O, b as v, c as E, t as _, r as L } from "./background2.mjs";
import { e as N, f as U, g as H, h as D, i as q } from "./background2.mjs";
(function() {
  try {
    var a = typeof window < "u" ? window : typeof global < "u" ? global : typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : {};
    a.SENTRY_RELEASE = { id: "d61553dafd81e9dbc55b313bda41af550f53d80a" }, a._sentryModuleMetadata = a._sentryModuleMetadata || {}, a._sentryModuleMetadata[new a.Error().stack] = (function(n) {
      for (var s = 1; s < arguments.length; s++) {
        var e = arguments[s];
        if (e != null) for (var c in e) e.hasOwnProperty(c) && (n[c] = e[c]);
      }
      return n;
    })({}, a._sentryModuleMetadata[new a.Error().stack], { version: "1.9.0", appHost: "background" });
    var r = new a.Error().stack;
    r && (a._sentryDebugIds = a._sentryDebugIds || {}, a._sentryDebugIds[r] = "041bf71d-016e-4550-a8b6-ccfe93c34ce7", a._sentryDebugIdIdentifier = "sentry-dbid-041bf71d-016e-4550-a8b6-ccfe93c34ce7");
  } catch {
  }
})();
async function R(a, r, n, s) {
  const e = await n.call(`sharing/${a}/challenge`);
  if (!e)
    return null;
  const {
    challengeKey: c,
    challengeSalt: u,
    challengeCiphertext: p
  } = e;
  let l;
  try {
    l = K.base64ToArrayBuffer(u);
  } catch {
    return null;
  }
  try {
    const o = await s.password.unwrapContentKey(
      c,
      r,
      l
    ), S = await s.challenge.decryptChallenge(
      p,
      o,
      l
    ), f = await n.call(
      `sharing/${a}/challenge`,
      {
        challengePlaintext: S
      },
      "POST"
    );
    if (!f.containerId)
      throw Error("Challenge unsuccessful");
    const {
      containerId: h,
      wrappedKey: k,
      salt: m
    } = f;
    return { unwrappedKey: await s.password.unwrapContainerKey(
      k,
      r,
      K.base64ToArrayBuffer(m)
    ), containerId: h };
  } catch (o) {
    return console.log(o), null;
  }
}
class M {
  constructor(r, n, s) {
    this.user = r, this.keychain = n, this.api = s;
  }
  async handleMultipartItems(r) {
    const s = (await this.api.call(
      "uploads/parts",
      {
        wrappedKey: r.wrappedKey
      },
      "POST"
    )).map((c) => c.id);
    console.log("ids:", s);
    const e = await this.api.call(
      "uploads/items",
      {
        ids: s,
        wrappedKey: r.wrappedKey
      },
      "POST"
    );
    return console.log("_items:", e), e;
  }
  // Creates AccessLink
  async shareItemsWithPassword(r, n, s) {
    const e = [];
    for (const u of r)
      if (u.multipart) {
        const p = await this.handleMultipartItems(u);
        e.push(...p);
      } else
        e.push(u);
    const c = await this.createShareOnlyContainer(e, null);
    return await this.requestAccessLink(c, n, s);
  }
  // Creates Invitation
  async shareContainerWithInvitation(r, n) {
    const s = await this.api.call(`users/lookup/${n}/`);
    if (s) {
      let e = s.publicKey;
      const c = s.id;
      for (e || console.log(`Could not find public key for user ${n}`), console.warn("SOMETHING WEIRD IS HAPPENING WITH PUBLIC KEYS ON SERVER"); typeof e != "object"; )
        e = JSON.parse(e);
      const u = await crypto.subtle.importKey(
        "jwk",
        e,
        {
          name: "RSA-OAEP",
          hash: { name: "SHA-256" }
        },
        !0,
        ["wrapKey"]
      ), p = await this.keychain.get(r), l = await this.keychain.rsa.wrapContainerKey(
        p,
        u
      );
      if (!l)
        return console.log("no wrapped key for the invitation"), null;
      const o = await this.api.call(
        `containers/${r}/member/invite`,
        {
          wrappedKey: l,
          recipientId: c,
          senderId: this.user.id
        },
        "POST"
      );
      return console.log("Invitation creation response:"), console.log(o), o;
    }
  }
  async createShareOnlyContainer(r = [], n = null) {
    var o, S, f;
    if (r.length === 0 && !n || !((o = this.api) != null && o.call) || !((S = this.keychain) != null && S.store))
      return null;
    const s = [...r];
    let e = { name: "default" };
    n && (e = await this.api.call(`containers/${n}/info`));
    const p = await this.api.call(
      "containers",
      {
        name: e.name,
        type: $.FOLDER,
        parentId: 0,
        shareOnly: !0
      },
      "POST"
    );
    if (!((f = p.container) != null && f.id))
      return null;
    const { id: l } = p.container;
    return await this.keychain.newKeyForContainer(l), await this.keychain.store(), await Promise.all(
      s.map(async (h) => {
        const k = h.containerId ?? h.folderId, m = h.name ?? h.filename, g = await this.keychain.get(k), { uploadId: b, wrappedKey: C, type: I } = h, P = await this.keychain.container.unwrapContentKey(
          C,
          g
        ), t = await this.keychain.get(l), i = await this.keychain.container.wrapContentKey(
          P,
          t
        );
        return await this.api.call(
          `containers/${l}/item`,
          {
            uploadId: b,
            name: m,
            type: I,
            wrappedKey: i,
            multipart: h.multipart ?? !1,
            totalSize: h.totalSize ?? void 0
          },
          "POST"
        );
      })
    ), l;
  }
  async requestAccessLink(r, n, s) {
    const e = await this.api.call(
      `sharing/${r}/canCreateAccessLink`
    );
    if (!(e != null && e.canCreateLink))
      throw new Error(
        "Cannot create access link for this container because it contains files that have been reported for abuse."
      );
    const c = await this.keychain.get(r), u = K.generateSalt(), p = await this.keychain.password.wrapContainerKey(
      c,
      n,
      //@ts-ignore
      u
    ), l = await this.keychain.challenge.generateKey(), o = K.generateSalt(), S = await this.keychain.password.wrapContentKey(
      l,
      n,
      //@ts-ignore
      o
    ), f = this.keychain.challenge.createChallenge(), h = await this.keychain.challenge.encryptChallenge(
      f,
      l,
      //@ts-ignore
      o
    ), k = K.arrayBufferToBase64(u), m = K.arrayBufferToBase64(o), g = await this.api.call(
      "sharing",
      {
        containerId: r,
        wrappedKey: p,
        salt: k,
        challengeKey: S,
        challengeSalt: m,
        senderId: this.user.id,
        challengePlaintext: f,
        challengeCiphertext: h,
        expiration: s
      },
      "POST"
    );
    return g != null && g.id ? `https://send.tb.pro/share/${g.id}` : null;
  }
}
const W = A("sharingManager", () => {
  const { api: a } = T(), { user: r } = O(), { keychain: n } = v(), s = new M(r, n, a), e = L([]), c = E(() => [...e.value]);
  async function u(t, i, d) {
    let y = !1;
    i.length === 0 && (i = K.generateRandomPassword(), y = !0);
    let w = await s.requestAccessLink(t, i, d);
    return w ? (y && (w = `${w}#${i}`), w) : null;
  }
  async function p(t, i) {
    const d = await R(
      t,
      i,
      a,
      n
    );
    if (!(d != null && d.unwrappedKey))
      return await _.incrementPasswordRetryCount.mutate({
        linkId: t
      }), !1;
    const { unwrappedKey: y, containerId: w } = d;
    return await n.rsa.generateKeyPair(), await n.add(w, y), await n.store(), !0;
  }
  async function l(t) {
    return await a.call(`sharing/exists/${t}`);
  }
  async function o(t) {
    e.value = await a.call(`containers/${t}/links`);
  }
  async function S(t) {
    e.value = await a.call(`sharing/${t}/links?type=file`);
  }
  async function f(t, i, d) {
    let y = !1;
    i.length === 0 && (i = K.generateRandomPassword(), y = !0);
    let w = await s.shareItemsWithPassword(
      t,
      i,
      d
    );
    return w ? (y && (w = `${w}#${i}`), w) : null;
  }
  async function h(t) {
    return await a.call(`sharing/${t}/`);
  }
  async function k(t) {
    return await a.call(`users/${t}/invitations/`);
  }
  async function m(t) {
    return await a.call(
      `users/${t}/folders/sharedWithUser`
    );
  }
  async function g(t) {
    return await a.call(`users/${t}/folders/sharedByUser`);
  }
  async function b(t, i) {
    return await a.call(`containers/${t}/shares`, {
      userId: i
    });
  }
  async function C(t, i) {
    return await a.call(
      `containers/${i}/member/accept/${t}`,
      {},
      "POST"
    );
  }
  async function I(t, i, d, y) {
    return await a.call(
      `containers/${t}/shares/invitation/update`,
      { userId: i, invitationId: d, permission: y },
      "POST"
    );
  }
  async function P(t, i, d, y) {
    return await a.call(
      `containers/${t}/shares/accessLink/update`,
      { userId: i, accessLinkId: d, permission: y },
      "POST"
    );
  }
  return {
    // Getters ==================================
    links: c,
    // Actions ==================================
    createAccessLink: u,
    isAccessLinkValid: l,
    acceptAccessLink: p,
    fetchFolderAccessLinks: o,
    fetchFileAccessLinks: S,
    shareItems: f,
    getSharedFolder: h,
    getInvitations: k,
    getFoldersSharedWithUser: m,
    getFoldersSharedByUser: g,
    getSharesForFolder: b,
    acceptInvitation: C,
    updateInvitationPermissions: I,
    updateAccessLinkPermissions: P
  };
});
export {
  T as useApiStore,
  N as useAuthStore,
  U as useConfigStore,
  H as useExtensionStore,
  D as useFolderStore,
  v as useKeychainStore,
  W as useMetricsStore,
  q as useStatusStore,
  O as useUserStore
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgubWpzIiwic291cmNlcyI6WyIuLi8uLi8uLi9zZW5kL2Zyb250ZW5kL3NyYy9saWIvY2hhbGxlbmdlLnRzIiwiLi4vLi4vLi4vc2VuZC9mcm9udGVuZC9zcmMvbGliL3NoYXJlLnRzIiwiLi4vLi4vLi4vc2VuZC9mcm9udGVuZC9zcmMvYXBwcy9zZW5kL3N0b3Jlcy9zaGFyaW5nLXN0b3JlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwaUNvbm5lY3Rpb24gfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIvYXBpJztcbmltcG9ydCB7IEtleWNoYWluLCBVdGlsIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL2tleWNoYWluJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldENvbnRhaW5lcktleUZyb21DaGFsbGVuZ2UoXG4gIGhhc2g6IHN0cmluZyxcbiAgcGFzc3dvcmQ6IHN0cmluZyxcbiAgYXBpOiBBcGlDb25uZWN0aW9uLFxuICBrZXljaGFpbjogS2V5Y2hhaW5cbik6IFByb21pc2U8e1xuICB1bndyYXBwZWRLZXk6IENyeXB0b0tleTtcbiAgY29udGFpbmVySWQ6IHN0cmluZztcbn0gfCBudWxsPiB7XG4gIGNvbnN0IHJlc3AgPSBhd2FpdCBhcGkuY2FsbDx7XG4gICAgY2hhbGxlbmdlS2V5OiBzdHJpbmc7XG4gICAgY2hhbGxlbmdlU2FsdDogc3RyaW5nO1xuICAgIGNoYWxsZW5nZUNpcGhlcnRleHQ6IHN0cmluZztcbiAgfT4oYHNoYXJpbmcvJHtoYXNofS9jaGFsbGVuZ2VgKTtcblxuICBpZiAoIXJlc3ApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIFN0ZXAgMTogcmVjZWl2ZSB0aGUgY2hhbGxlbmdlIGluZm8sXG4gIC8vIHJlbmFtaW5nIGVhY2ggcHJvcGVydHkgc28gaXQncyBjbGVhciB0aGF0IHdlJ3JlIHdvcmtpbmcgd2l0aCBzdHJpbmdzLlxuICBjb25zdCB7XG4gICAgY2hhbGxlbmdlS2V5OiBjaGFsbGVuZ2VLZXlTdHIsXG4gICAgY2hhbGxlbmdlU2FsdDogY2hhbGxlbmdlU2FsdFN0cixcbiAgICBjaGFsbGVuZ2VDaXBoZXJ0ZXh0LFxuICB9ID0gcmVzcDtcblxuICAvLyBTdGVwIDI6IGNvbnZlcnQgdG8gYXJyYXkgYnVmZmVycywgYXMgbmVjZXNzYXJ5LlxuICAvLyBPbmx5IHRoZSBzYWx0IG5lZWRzIHRvIGJlIGNvbnZlcnRlZCB0byBhbiBhcnJheSBidWZmZXIuXG4gIC8vIFRoaXMgaXMgaGFuZGxlZCBhdXRvbWF0aWNhbGx5IGJ5IGtleWNoYWluLnBhc3N3b3JkLnVud3JhcENvbnRlbnRLZXlcbiAgbGV0IGNoYWxsZW5nZVNhbHQ6IEFycmF5QnVmZmVyTGlrZTtcbiAgdHJ5IHtcbiAgICBjaGFsbGVuZ2VTYWx0ID0gVXRpbC5iYXNlNjRUb0FycmF5QnVmZmVyKGNoYWxsZW5nZVNhbHRTdHIpO1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnNcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBTdGVwIDM6IHVud3JhcCB0aGUgY2hhbGxlbmdlIGtleSB1c2luZyB0aGUgcGFzc3dvcmRcbiAgICBjb25zdCB1bndyYXBwZWRDaGFsbGVuZ2VLZXk6IENyeXB0b0tleSA9XG4gICAgICBhd2FpdCBrZXljaGFpbi5wYXNzd29yZC51bndyYXBDb250ZW50S2V5KFxuICAgICAgICBjaGFsbGVuZ2VLZXlTdHIsXG4gICAgICAgIHBhc3N3b3JkLFxuICAgICAgICBjaGFsbGVuZ2VTYWx0XG4gICAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBkZWNyeXB0IHRoZSBjaGFsbGVuZ2UgY2lwaGVydGV4dCBhbmQgc2VuZCBpdCBiYWNrXG4gICAgY29uc3QgY2hhbGxlbmdlUGxhaW50ZXh0OiBzdHJpbmcgPVxuICAgICAgYXdhaXQga2V5Y2hhaW4uY2hhbGxlbmdlLmRlY3J5cHRDaGFsbGVuZ2UoXG4gICAgICAgIGNoYWxsZW5nZUNpcGhlcnRleHQsXG4gICAgICAgIHVud3JhcHBlZENoYWxsZW5nZUtleSxcbiAgICAgICAgY2hhbGxlbmdlU2FsdFxuICAgICAgKTtcblxuICAgIC8vIFN0ZXAgNTogcG9zdCB0aGUgY2hhbGxlbmdlIHRleHQgdG8gcmVjZWl2ZTpcbiAgICAvLyAtIGNvbnRhaW5lcklkXG4gICAgLy8gLSB3cmFwcGVkIGNvbnRhaW5lciBrZXlcbiAgICAvLyAtIHNhbHQgKGZvciB1bndyYXBwaW5nIGNvbnRhaW5lciBrZXkpXG4gICAgY29uc3QgY2hhbGxlbmdlUmVzcCA9IGF3YWl0IGFwaS5jYWxsPHtcbiAgICAgIHN0YXR1czogc3RyaW5nO1xuICAgICAgY29udGFpbmVySWQ6IHN0cmluZztcbiAgICAgIHdyYXBwZWRLZXk6IHN0cmluZztcbiAgICAgIHNhbHQ6IHN0cmluZztcbiAgICB9PihcbiAgICAgIGBzaGFyaW5nLyR7aGFzaH0vY2hhbGxlbmdlYCxcbiAgICAgIHtcbiAgICAgICAgY2hhbGxlbmdlUGxhaW50ZXh0LFxuICAgICAgfSxcbiAgICAgICdQT1NUJ1xuICAgICk7XG5cbiAgICBpZiAoIWNoYWxsZW5nZVJlc3AuY29udGFpbmVySWQpIHtcbiAgICAgIHRocm93IEVycm9yKCdDaGFsbGVuZ2UgdW5zdWNjZXNzZnVsJyk7XG4gICAgfVxuICAgIGNvbnN0IHtcbiAgICAgIGNvbnRhaW5lcklkLFxuICAgICAgd3JhcHBlZEtleTogd3JhcHBlZEtleVN0cixcbiAgICAgIHNhbHQ6IHNhbHRTdHIsXG4gICAgfSA9IGNoYWxsZW5nZVJlc3A7XG5cbiAgICAvLyBTdGVwIDY6IHVud3JhcCB0aGUgY29udGFpbmVyIGtleSB1c2luZyB0aGUgcGFzc3dvcmRcbiAgICBjb25zdCB1bndyYXBwZWRLZXk6IENyeXB0b0tleSA9IGF3YWl0IGtleWNoYWluLnBhc3N3b3JkLnVud3JhcENvbnRhaW5lcktleShcbiAgICAgIHdyYXBwZWRLZXlTdHIsXG4gICAgICBwYXNzd29yZCxcbiAgICAgIFV0aWwuYmFzZTY0VG9BcnJheUJ1ZmZlcihzYWx0U3RyKVxuICAgICk7XG5cbiAgICByZXR1cm4geyB1bndyYXBwZWRLZXksIGNvbnRhaW5lcklkIH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmxvZyhlKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuIiwiaW1wb3J0IHtcbiAgRm9sZGVyUmVzcG9uc2UsXG4gIEl0ZW0sXG59IGZyb20gJ0BzZW5kLWZyb250ZW5kL2FwcHMvc2VuZC9zdG9yZXMvZm9sZGVyLXN0b3JlLnR5cGVzJztcbmltcG9ydCB7IEFwaUNvbm5lY3Rpb24gfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIvYXBpJztcbmltcG9ydCB7IENPTlRBSU5FUl9UWVBFIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL2NvbnN0JztcbmltcG9ydCB7IEtleWNoYWluLCBVdGlsIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL2tleWNoYWluJztcbmltcG9ydCB7IFVzZXJUeXBlIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvdHlwZXMnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTaGFyZXIge1xuICB1c2VyOiBVc2VyVHlwZTtcbiAga2V5Y2hhaW46IEtleWNoYWluO1xuICBhcGk6IEFwaUNvbm5lY3Rpb247XG4gIGNvbnN0cnVjdG9yKHVzZXI6IFVzZXJUeXBlLCBrZXljaGFpbjogS2V5Y2hhaW4sIGFwaTogQXBpQ29ubmVjdGlvbikge1xuICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgdGhpcy5rZXljaGFpbiA9IGtleWNoYWluO1xuICAgIHRoaXMuYXBpID0gYXBpO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTXVsdGlwYXJ0SXRlbXMoaXRlbTogSXRlbSk6IFByb21pc2U8SXRlbVtdPiB7XG4gICAgY29uc3QgX3VwbG9hZHMgPSBhd2FpdCB0aGlzLmFwaS5jYWxsPHsgaWQ6IHN0cmluZzsgcGFydDogbnVtYmVyIH1bXT4oXG4gICAgICBgdXBsb2Fkcy9wYXJ0c2AsXG4gICAgICB7XG4gICAgICAgIHdyYXBwZWRLZXk6IGl0ZW0ud3JhcHBlZEtleSxcbiAgICAgIH0sXG4gICAgICAnUE9TVCdcbiAgICApO1xuICAgIGNvbnN0IGlkcyA9IF91cGxvYWRzLm1hcCgodSkgPT4gdS5pZCk7XG4gICAgY29uc29sZS5sb2coYGlkczpgLCBpZHMpO1xuICAgIGNvbnN0IF9pdGVtcyA9IGF3YWl0IHRoaXMuYXBpLmNhbGw8SXRlbVtdPihcbiAgICAgIGB1cGxvYWRzL2l0ZW1zYCxcbiAgICAgIHtcbiAgICAgICAgaWRzLFxuICAgICAgICB3cmFwcGVkS2V5OiBpdGVtLndyYXBwZWRLZXksXG4gICAgICB9LFxuICAgICAgJ1BPU1QnXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZyhgX2l0ZW1zOmAsIF9pdGVtcyk7XG4gICAgcmV0dXJuIF9pdGVtcztcbiAgfVxuXG4gIC8vIENyZWF0ZXMgQWNjZXNzTGlua1xuICBhc3luYyBzaGFyZUl0ZW1zV2l0aFBhc3N3b3JkKFxuICAgIGl0ZW1zOiBJdGVtW10sXG4gICAgcGFzc3dvcmQ6IHN0cmluZyxcbiAgICBleHBpcmF0aW9uPzogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IF9faXRlbXM6IEl0ZW1bXSA9IFtdO1xuICAgIC8vIExvb3AgdGhyb3VnaCB0aGUgaXRlbXNcbiAgICAvLyBNdWx0aXBhcnQgaXRlbXMgc2hvdWxkIGJlIGhhbmRsZWQgYnkgYGhhbmRsZU11bHRpcGFydEl0ZW1zYFxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgaWYgKGl0ZW0ubXVsdGlwYXJ0KSB7XG4gICAgICAgIGNvbnN0IF9pdGVtcyA9IGF3YWl0IHRoaXMuaGFuZGxlTXVsdGlwYXJ0SXRlbXMoaXRlbSk7XG4gICAgICAgIF9faXRlbXMucHVzaCguLi5faXRlbXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgX19pdGVtcy5wdXNoKGl0ZW0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbnRhaW5lcklkID0gYXdhaXQgdGhpcy5jcmVhdGVTaGFyZU9ubHlDb250YWluZXIoX19pdGVtcywgbnVsbCk7XG4gICAgcmV0dXJuIGF3YWl0IHRoaXMucmVxdWVzdEFjY2Vzc0xpbmsoY29udGFpbmVySWQsIHBhc3N3b3JkLCBleHBpcmF0aW9uKTtcbiAgfVxuXG4gIC8vIENyZWF0ZXMgSW52aXRhdGlvblxuICBhc3luYyBzaGFyZUNvbnRhaW5lcldpdGhJbnZpdGF0aW9uKGNvbnRhaW5lcklkOiBzdHJpbmcsIGVtYWlsOiBzdHJpbmcpIHtcbiAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5hcGkuY2FsbChgdXNlcnMvbG9va3VwLyR7ZW1haWx9L2ApO1xuXG4gICAgaWYgKHVzZXIpIHtcbiAgICAgIGxldCBwdWJsaWNLZXkgPSB1c2VyLnB1YmxpY0tleTtcbiAgICAgIGNvbnN0IHJlY2lwaWVudElkID0gdXNlci5pZDtcbiAgICAgIGlmICghcHVibGljS2V5KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBDb3VsZCBub3QgZmluZCBwdWJsaWMga2V5IGZvciB1c2VyICR7ZW1haWx9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUud2FybignU09NRVRISU5HIFdFSVJEIElTIEhBUFBFTklORyBXSVRIIFBVQkxJQyBLRVlTIE9OIFNFUlZFUicpO1xuXG4gICAgICAvLyBUT0RPOiBtYWtlIHN1cmUgd2UncmUgbm90IGRvdWJsZS1lc2NhcGluZyBiZWZvcmUgc3RvcmluZyBvbiBzZXJ2ZXJcbiAgICAgIHdoaWxlICh0eXBlb2YgcHVibGljS2V5ICE9PSAnb2JqZWN0Jykge1xuICAgICAgICBwdWJsaWNLZXkgPSBKU09OLnBhcnNlKHB1YmxpY0tleSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGltcG9ydGVkUHVibGljS2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoXG4gICAgICAgICdqd2snLFxuICAgICAgICBwdWJsaWNLZXksXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiAnUlNBLU9BRVAnLFxuICAgICAgICAgIGhhc2g6IHsgbmFtZTogJ1NIQS0yNTYnIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHRydWUsXG4gICAgICAgIFsnd3JhcEtleSddXG4gICAgICApO1xuXG4gICAgICBjb25zdCBrZXkgPSBhd2FpdCB0aGlzLmtleWNoYWluLmdldChjb250YWluZXJJZCk7XG4gICAgICBjb25zdCB3cmFwcGVkS2V5ID0gYXdhaXQgdGhpcy5rZXljaGFpbi5yc2Eud3JhcENvbnRhaW5lcktleShcbiAgICAgICAga2V5LFxuICAgICAgICBpbXBvcnRlZFB1YmxpY0tleVxuICAgICAgKTtcblxuICAgICAgaWYgKCF3cmFwcGVkS2V5KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBubyB3cmFwcGVkIGtleSBmb3IgdGhlIGludml0YXRpb25gKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFwaS5jYWxsKFxuICAgICAgICBgY29udGFpbmVycy8ke2NvbnRhaW5lcklkfS9tZW1iZXIvaW52aXRlYCxcbiAgICAgICAge1xuICAgICAgICAgIHdyYXBwZWRLZXksXG4gICAgICAgICAgcmVjaXBpZW50SWQsXG4gICAgICAgICAgc2VuZGVySWQ6IHRoaXMudXNlci5pZCxcbiAgICAgICAgfSxcbiAgICAgICAgJ1BPU1QnXG4gICAgICApO1xuICAgICAgY29uc29sZS5sb2coYEludml0YXRpb24gY3JlYXRpb24gcmVzcG9uc2U6YCk7XG4gICAgICBjb25zb2xlLmxvZyhyZXNwKTtcbiAgICAgIHJldHVybiByZXNwO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZVNoYXJlT25seUNvbnRhaW5lcihcbiAgICBpdGVtcyA9IFtdLFxuICAgIGNvbnRhaW5lcklkID0gbnVsbFxuICApOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBpZiAoaXRlbXMubGVuZ3RoID09PSAwICYmICFjb250YWluZXJJZCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gQXJiaXRyYXJpbHkgcGlja2VkIGtleWNoYWluLnZhbHVlLnN0b3JlIHRvXG4gICAgLy8gY29uZmlybSBwcmVzZW5jZSBvZiBrZXljaGFpblxuICAgIGlmICghdGhpcy5hcGk/LmNhbGwgfHwgIXRoaXMua2V5Y2hhaW4/LnN0b3JlKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtc1RvU2hhcmUgPSBbLi4uaXRlbXNdO1xuXG4gICAgbGV0IGN1cnJlbnRDb250YWluZXIgPSB7IG5hbWU6ICdkZWZhdWx0JyB9O1xuICAgIGlmIChjb250YWluZXJJZCkge1xuICAgICAgY3VycmVudENvbnRhaW5lciA9IGF3YWl0IHRoaXMuYXBpLmNhbGwoYGNvbnRhaW5lcnMvJHtjb250YWluZXJJZH0vaW5mb2ApO1xuICAgICAgLy8gVE9ETzogZnV0dXJlIGVuaGFuY2VtZW50XG4gICAgICAvLyBJZiB0aGVyZSBhcmUgbm8gaXRlbXNUb1NoYXJlLCBnZXQgdGhlIGl0ZW1zIGZyb20gdGhlIGBjdXJyZW50Q29udGFpbmVyYFxuICAgICAgLy8gaWYgKGl0ZW1zVG9TaGFyZS5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBjb25zdCB7IGl0ZW1zIH0gPSBhd2FpdCBhcGkuZ2V0Q29udGFpbmVyV2l0aEl0ZW1zKGNvbnRhaW5lcklkKTtcbiAgICAgIC8vIGl0ZW1zVG9TaGFyZSA9IGl0ZW1zO1xuICAgICAgLy8gfVxuICAgIH1cblxuICAgIC8vIEEgc2hhcmUtb25seSBGb2xkZXIgc2hvdWxkbid0IGhhdmUgYSBwYXJlbnRJZFxuICAgIGNvbnN0IHBhcmVudElkID0gMDtcbiAgICBjb25zdCBzaGFyZU9ubHkgPSB0cnVlO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmFwaS5jYWxsPHsgY29udGFpbmVyOiBGb2xkZXJSZXNwb25zZSB9PihcbiAgICAgIGBjb250YWluZXJzYCxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogY3VycmVudENvbnRhaW5lci5uYW1lLFxuICAgICAgICB0eXBlOiBDT05UQUlORVJfVFlQRS5GT0xERVIsXG4gICAgICAgIHBhcmVudElkLFxuICAgICAgICBzaGFyZU9ubHksXG4gICAgICB9LFxuICAgICAgJ1BPU1QnXG4gICAgKTtcbiAgICBpZiAoIXJlc3BvbnNlLmNvbnRhaW5lcj8uaWQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCB7IGlkOiBuZXdDb250YWluZXJJZCB9ID0gcmVzcG9uc2UuY29udGFpbmVyO1xuXG4gICAgYXdhaXQgdGhpcy5rZXljaGFpbi5uZXdLZXlGb3JDb250YWluZXIobmV3Q29udGFpbmVySWQpO1xuICAgIGF3YWl0IHRoaXMua2V5Y2hhaW4uc3RvcmUoKTtcblxuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgaXRlbXNUb1NoYXJlLm1hcChhc3luYyAoaXRlbSkgPT4ge1xuICAgICAgICAvLyBUT0RPOiBsb2NhdGUgc291cmNlIG9mIFwiZm9sZGVySWRcIiBwcm9wZXJ0eVxuICAgICAgICAvLyByZW5hbWUgdG8gbW9yZSBnZW5lcmljIFwiY29udGFpbmVySWRcIlxuICAgICAgICBjb25zdCBjb250YWluZXJJZCA9IGl0ZW0uY29udGFpbmVySWQgPz8gaXRlbS5mb2xkZXJJZDtcbiAgICAgICAgLy8gVE9ETzogbG9jYXRlIHNvdXJjZSBvZiBcImZpbGVuYW1lXCIgcHJvcGVydHlcbiAgICAgICAgLy8gcmVuYW1lIHRvIG1vcmUgZ2VuZXJpYyBcIm5hbWVcIlxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGl0ZW0ubmFtZSA/PyBpdGVtLmZpbGVuYW1lO1xuICAgICAgICBjb25zdCBjdXJyZW50V3JhcHBpbmdLZXkgPSBhd2FpdCB0aGlzLmtleWNoYWluLmdldChjb250YWluZXJJZCk7XG4gICAgICAgIGNvbnN0IHsgdXBsb2FkSWQsIHdyYXBwZWRLZXksIHR5cGUgfSA9IGl0ZW07XG4gICAgICAgIGNvbnN0IGNvbnRlbnRLZXkgPSBhd2FpdCB0aGlzLmtleWNoYWluLmNvbnRhaW5lci51bndyYXBDb250ZW50S2V5KFxuICAgICAgICAgIHdyYXBwZWRLZXksXG4gICAgICAgICAgY3VycmVudFdyYXBwaW5nS2V5XG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gd3JhcCB0aGUgY29udGVudCBrZXkgd2l0aCB0aGUgbmV3IGNvbnRhaW5lciBrZXlcbiAgICAgICAgY29uc3QgbmV3V3JhcHBpbmdLZXkgPSBhd2FpdCB0aGlzLmtleWNoYWluLmdldChuZXdDb250YWluZXJJZCk7XG5cbiAgICAgICAgY29uc3Qgd3JhcHBlZEtleVN0ciA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uY29udGFpbmVyLndyYXBDb250ZW50S2V5KFxuICAgICAgICAgIGNvbnRlbnRLZXksXG4gICAgICAgICAgbmV3V3JhcHBpbmdLZXlcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBjcmVhdGUgdGhlIG5ldyBpdGVtIHdpdGggdGhlIGV4aXN0aW5nIHVwbG9hZElkXG4gICAgICAgIC8vIGluIHRoZSBuZXdDb250YWluZXJcblxuICAgICAgICBjb25zdCBpdGVtUmVzcCA9IGF3YWl0IHRoaXMuYXBpLmNhbGwoXG4gICAgICAgICAgYGNvbnRhaW5lcnMvJHtuZXdDb250YWluZXJJZH0vaXRlbWAsXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXBsb2FkSWQsXG4gICAgICAgICAgICBuYW1lOiBmaWxlbmFtZSxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICB3cmFwcGVkS2V5OiB3cmFwcGVkS2V5U3RyLFxuICAgICAgICAgICAgbXVsdGlwYXJ0OiBpdGVtLm11bHRpcGFydCA/PyBmYWxzZSxcbiAgICAgICAgICAgIHRvdGFsU2l6ZTogaXRlbS50b3RhbFNpemUgPz8gdW5kZWZpbmVkLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ1BPU1QnXG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGl0ZW1SZXNwO1xuICAgICAgfSlcbiAgICApO1xuXG4gICAgcmV0dXJuIG5ld0NvbnRhaW5lcklkO1xuICB9XG5cbiAgYXN5bmMgcmVxdWVzdEFjY2Vzc0xpbmsoXG4gICAgY29udGFpbmVySWQ6IHN0cmluZyxcbiAgICBwYXNzd29yZD86IHN0cmluZyxcbiAgICBleHBpcmF0aW9uPzogc3RyaW5nXG4gICk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIC8vIGNoZWNrIGlmIHRoZSBjb250YWluZXIgZG9lc24ndCBoYXZlIHJlcG9ydGVkIGl0ZW1zIGZpcnN0XG4gICAgY29uc3QgY2FuQ3JlYXRlTGluayA9IGF3YWl0IHRoaXMuYXBpLmNhbGw8eyBjYW5DcmVhdGVMaW5rOiBib29sZWFuIH0+KFxuICAgICAgYHNoYXJpbmcvJHtjb250YWluZXJJZH0vY2FuQ3JlYXRlQWNjZXNzTGlua2BcbiAgICApO1xuXG4gICAgaWYgKCFjYW5DcmVhdGVMaW5rPy5jYW5DcmVhdGVMaW5rKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdDYW5ub3QgY3JlYXRlIGFjY2VzcyBsaW5rIGZvciB0aGlzIGNvbnRhaW5lciBiZWNhdXNlIGl0IGNvbnRhaW5zIGZpbGVzIHRoYXQgaGF2ZSBiZWVuIHJlcG9ydGVkIGZvciBhYnVzZS4nXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIGdldCB0aGUga2V5ICh3aGljaCB1bndyYXBzIGl0KSxcbiAgICBjb25zdCB1bndyYXBwZWRLZXkgPSBhd2FpdCB0aGlzLmtleWNoYWluLmdldChjb250YWluZXJJZCk7XG5cbiAgICAvLyBhbmQgcGFzc3dvcmQgcHJvdGVjdCBpdFxuICAgIGNvbnN0IHNhbHQgPSBVdGlsLmdlbmVyYXRlU2FsdCgpO1xuICAgIGNvbnN0IHBhc3N3b3JkV3JhcHBlZEtleVN0ciA9IGF3YWl0IHRoaXMua2V5Y2hhaW4ucGFzc3dvcmQud3JhcENvbnRhaW5lcktleShcbiAgICAgIHVud3JhcHBlZEtleSxcbiAgICAgIHBhc3N3b3JkLFxuICAgICAgLy9AdHMtaWdub3JlXG4gICAgICBzYWx0XG4gICAgKTtcblxuICAgIGNvbnN0IGNoYWxsZW5nZUtleSA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uY2hhbGxlbmdlLmdlbmVyYXRlS2V5KCk7XG4gICAgY29uc3QgY2hhbGxlbmdlU2FsdCA9IFV0aWwuZ2VuZXJhdGVTYWx0KCk7XG5cbiAgICBjb25zdCBwYXNzd29yZFdyYXBwZWRDaGFsbGVuZ2VLZXlTdHIgPVxuICAgICAgYXdhaXQgdGhpcy5rZXljaGFpbi5wYXNzd29yZC53cmFwQ29udGVudEtleShcbiAgICAgICAgY2hhbGxlbmdlS2V5LFxuICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgLy9AdHMtaWdub3JlXG4gICAgICAgIGNoYWxsZW5nZVNhbHRcbiAgICAgICk7XG5cbiAgICBjb25zdCBjaGFsbGVuZ2VQbGFpbnRleHQgPSB0aGlzLmtleWNoYWluLmNoYWxsZW5nZS5jcmVhdGVDaGFsbGVuZ2UoKTtcblxuICAgIGNvbnN0IGNoYWxsZW5nZUNpcGhlcnRleHQgPSBhd2FpdCB0aGlzLmtleWNoYWluLmNoYWxsZW5nZS5lbmNyeXB0Q2hhbGxlbmdlKFxuICAgICAgY2hhbGxlbmdlUGxhaW50ZXh0LFxuICAgICAgY2hhbGxlbmdlS2V5LFxuICAgICAgLy9AdHMtaWdub3JlXG4gICAgICBjaGFsbGVuZ2VTYWx0XG4gICAgKTtcblxuICAgIC8vIGNvbnZlcnQgc2FsdHMgdG8gYmFzZTY0IHN0cmluZ3NcbiAgICBjb25zdCBzYWx0U3RyID0gVXRpbC5hcnJheUJ1ZmZlclRvQmFzZTY0KHNhbHQpO1xuICAgIGNvbnN0IGNoYWxsZW5nZVNhbHRTdHIgPSBVdGlsLmFycmF5QnVmZmVyVG9CYXNlNjQoY2hhbGxlbmdlU2FsdCk7XG5cbiAgICBjb25zdCByZXNwID0gYXdhaXQgdGhpcy5hcGkuY2FsbDx7IGlkOiBzdHJpbmc7IGV4cGlyeURhdGU6IHN0cmluZyB8IG51bGwgfT4oXG4gICAgICBgc2hhcmluZ2AsXG4gICAgICB7XG4gICAgICAgIGNvbnRhaW5lcklkLFxuICAgICAgICB3cmFwcGVkS2V5OiBwYXNzd29yZFdyYXBwZWRLZXlTdHIsXG4gICAgICAgIHNhbHQ6IHNhbHRTdHIsXG4gICAgICAgIGNoYWxsZW5nZUtleTogcGFzc3dvcmRXcmFwcGVkQ2hhbGxlbmdlS2V5U3RyLFxuICAgICAgICBjaGFsbGVuZ2VTYWx0OiBjaGFsbGVuZ2VTYWx0U3RyLFxuICAgICAgICBzZW5kZXJJZDogdGhpcy51c2VyLmlkLFxuICAgICAgICBjaGFsbGVuZ2VQbGFpbnRleHQsXG4gICAgICAgIGNoYWxsZW5nZUNpcGhlcnRleHQsXG4gICAgICAgIGV4cGlyYXRpb24sXG4gICAgICB9LFxuICAgICAgJ1BPU1QnXG4gICAgKTtcblxuICAgIGlmICghcmVzcD8uaWQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGFjY2Vzc0xpbmsgPSByZXNwLmlkO1xuICAgIC8vIGNvbnN0IHVybCA9IGAke29yaWdpbn0vc2hhcmUvJHthY2Nlc3NMaW5rfWA7XG4gICAgLy8gVE9ETzogbmVlZCB0aGUgc2VydmVyIHVybCBmcm9tLi4uZWxzZXdoZXJlXG4gICAgLy8gVXNpbmcgYG9yaWdpbmAgd29ya3MgZmluZSBmb3Igd2ViIGFwcGxpY2F0aW9uLCBidXQgbm90IGZvciBleHRlbnNpb25cbiAgICBjb25zdCB1cmwgPSBgJHtpbXBvcnQubWV0YS5lbnYuVklURV9TRU5EX0NMSUVOVF9VUkx9L3NoYXJlLyR7YWNjZXNzTGlua31gO1xuICAgIHJldHVybiB1cmw7XG4gIH1cbn1cbiIsImltcG9ydCB7XG4gIEZvbGRlclJlc3BvbnNlLFxuICBJdGVtLFxufSBmcm9tICdAc2VuZC1mcm9udGVuZC9hcHBzL3NlbmQvc3RvcmVzL2ZvbGRlci1zdG9yZS50eXBlcyc7XG5pbXBvcnQgeyBnZXRDb250YWluZXJLZXlGcm9tQ2hhbGxlbmdlIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL2NoYWxsZW5nZSc7XG5pbXBvcnQgeyBLZXljaGFpbiwgVXRpbCB9IGZyb20gJ0BzZW5kLWZyb250ZW5kL2xpYi9rZXljaGFpbic7XG5pbXBvcnQgU2hhcmVyIGZyb20gJ0BzZW5kLWZyb250ZW5kL2xpYi9zaGFyZSc7XG5pbXBvcnQgeyB0cnBjIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL3RycGMnO1xuaW1wb3J0IHVzZUFwaVN0b3JlIGZyb20gJ0BzZW5kLWZyb250ZW5kL3N0b3Jlcy9hcGktc3RvcmUnO1xuaW1wb3J0IHVzZUtleWNoYWluU3RvcmUgZnJvbSAnQHNlbmQtZnJvbnRlbmQvc3RvcmVzL2tleWNoYWluLXN0b3JlJztcbmltcG9ydCB1c2VVc2VyU3RvcmUgZnJvbSAnQHNlbmQtZnJvbnRlbmQvc3RvcmVzL3VzZXItc3RvcmUnO1xuaW1wb3J0IHsgVXNlclR5cGUgfSBmcm9tICdAc2VuZC1mcm9udGVuZC90eXBlcyc7XG5pbXBvcnQgeyBkZWZpbmVTdG9yZSB9IGZyb20gJ3BpbmlhJztcbmltcG9ydCB7IGNvbXB1dGVkLCByZWYgfSBmcm9tICd2dWUnO1xuXG50eXBlIEFjY2Vzc0xpbmtzID0ge1xuICBpZDogc3RyaW5nO1xuICBleHBpcnlEYXRlOiBEYXRlIHwgbnVsbDtcbiAgcGFzc3dvcmRIYXNoOiBzdHJpbmc7XG4gIGxvY2tlZDogYm9vbGVhbjtcbn1bXTtcblxuY29uc3QgdXNlU2hhcmluZ1N0b3JlID0gZGVmaW5lU3RvcmUoJ3NoYXJpbmdNYW5hZ2VyJywgKCkgPT4ge1xuICBjb25zdCB7IGFwaSB9ID0gdXNlQXBpU3RvcmUoKTtcbiAgY29uc3QgeyB1c2VyIH0gPSB1c2VVc2VyU3RvcmUoKTtcbiAgY29uc3QgeyBrZXljaGFpbiB9ID0gdXNlS2V5Y2hhaW5TdG9yZSgpO1xuXG4gIGNvbnN0IHNoYXJlciA9IG5ldyBTaGFyZXIodXNlciBhcyBVc2VyVHlwZSwga2V5Y2hhaW4gYXMgS2V5Y2hhaW4sIGFwaSk7XG5cbiAgY29uc3QgX2xpbmtzID0gcmVmPEFjY2Vzc0xpbmtzPihbXSk7XG5cbiAgY29uc3QgbGlua3MgPSBjb21wdXRlZCgoKSA9PiB7XG4gICAgcmV0dXJuIFsuLi5fbGlua3MudmFsdWVdO1xuICB9KTtcblxuICBhc3luYyBmdW5jdGlvbiBjcmVhdGVBY2Nlc3NMaW5rKFxuICAgIGZvbGRlcklkOiBzdHJpbmcsXG4gICAgcGFzc3dvcmQ6IHN0cmluZyxcbiAgICBleHBpcmF0aW9uOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgbGV0IHNob3VsZEFkZFBhc3N3b3JkQXNIYXNoID0gZmFsc2U7XG5cbiAgICBpZiAocGFzc3dvcmQubGVuZ3RoID09PSAwKSB7XG4gICAgICBwYXNzd29yZCA9IFV0aWwuZ2VuZXJhdGVSYW5kb21QYXNzd29yZCgpO1xuICAgICAgc2hvdWxkQWRkUGFzc3dvcmRBc0hhc2ggPSB0cnVlO1xuICAgIH1cblxuICAgIGxldCB1cmwgPSBhd2FpdCBzaGFyZXIucmVxdWVzdEFjY2Vzc0xpbmsoZm9sZGVySWQsIHBhc3N3b3JkLCBleHBpcmF0aW9uKTtcblxuICAgIGlmICghdXJsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoc2hvdWxkQWRkUGFzc3dvcmRBc0hhc2gpIHtcbiAgICAgIHVybCA9IGAke3VybH0jJHtwYXNzd29yZH1gO1xuICAgIH1cblxuICAgIHJldHVybiB1cmw7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBhY2NlcHRBY2Nlc3NMaW5rKFxuICAgIGxpbmtJZDogc3RyaW5nLFxuICAgIHBhc3N3b3JkOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgY29udGFpbmVyS2V5ID0gYXdhaXQgZ2V0Q29udGFpbmVyS2V5RnJvbUNoYWxsZW5nZShcbiAgICAgIGxpbmtJZCxcbiAgICAgIHBhc3N3b3JkLFxuICAgICAgYXBpLFxuICAgICAga2V5Y2hhaW4gYXMgS2V5Y2hhaW5cbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIHBhc3N3b3JkIGlzIGluY29ycmVjdCwgaW5jcmVtZW50IHRoZSBwYXNzd29yZCByZXRyeSBjb3VudC5cbiAgICBpZiAoIWNvbnRhaW5lcktleT8udW53cmFwcGVkS2V5KSB7XG4gICAgICBhd2FpdCB0cnBjLmluY3JlbWVudFBhc3N3b3JkUmV0cnlDb3VudC5tdXRhdGUoe1xuICAgICAgICBsaW5rSWQsXG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBleGlzdGVuY2Ugb2YgbGluay5cbiAgICBjb25zdCB7IHVud3JhcHBlZEtleSwgY29udGFpbmVySWQgfSA9IGNvbnRhaW5lcktleTtcbiAgICBhd2FpdCBrZXljaGFpbi5yc2EuZ2VuZXJhdGVLZXlQYWlyKCk7XG5cbiAgICAvLyBUaGlzIGJsb2NrIGlzIG5vdCB1c2VkIGN1cnJlbnRseSwgaXQncyBtZWFudCB0byBtYWtlIHRoZSB1c2VyIGEgbWVtYmVyIG9mIHRoZSBzaGFyZWQgY29udGFpbmVyXG4gICAgLy8gaWYgKHVzZXIuaWQpIHtcbiAgICAvLyAgIC8vIC8vIFVzZSB0aGUgQWNjZXNzTGluayB0byBtYWtlIHRoZSBVc2VyIGEgbWVtYmVyIG9mIHRoZSBzaGFyZWQgZm9sZGVyLlxuICAgIC8vICAgLy8gY29uc3QgYWNjZXB0QWNjZXNzTGlua1Jlc3AgPSBhd2FpdCBhcGkuY2FsbChcbiAgICAvLyAgIC8vICAgYHNoYXJpbmcvJHtsaW5rSWR9L21lbWJlci9hY2NlcHRgLFxuICAgIC8vICAgLy8gICB7fSxcbiAgICAvLyAgIC8vICAgJ1BPU1QnXG4gICAgLy8gICAvLyApO1xuICAgIC8vICAgLy8gaWYgKCFhY2NlcHRBY2Nlc3NMaW5rUmVzcCkge1xuICAgIC8vICAgLy8gICByZXR1cm4gZmFsc2U7XG4gICAgLy8gICAvLyB9XG4gICAgLy8gfSBlbHNlIHtcbiAgICAvLyAgIC8vIFRPRE86IGNvbnNpZGVyIHN3aXRjaGluZyB0byBzZXNzaW9uU3RvcmFnZS5cbiAgICAvLyAgIC8vIEdlbmVyYXRlIGEgdGVtcG9yYXJ5IGtleXBhaXIgZm9yIGVuY3J5cHRpbmcgY29udGFpbmVyS2V5IGluIGtleWNoYWluLlxuICAgIC8vICAgLy8gYXdhaXQga2V5Y2hhaW4ucnNhLmdlbmVyYXRlS2V5UGFpcigpO1xuICAgIC8vIH1cblxuICAgIGF3YWl0IGtleWNoYWluLmFkZChjb250YWluZXJJZCwgdW53cmFwcGVkS2V5KTtcbiAgICBhd2FpdCBrZXljaGFpbi5zdG9yZSgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gaXNBY2Nlc3NMaW5rVmFsaWQobGlua0lkOiBzdHJpbmcpOiBQcm9taXNlPHsgaWQ6IHN0cmluZyB9PiB7XG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsPHsgaWQ6IHN0cmluZyB9Pihgc2hhcmluZy9leGlzdHMvJHtsaW5rSWR9YCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBmZXRjaEZvbGRlckFjY2Vzc0xpbmtzKGZvbGRlcklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBfbGlua3MudmFsdWUgPSBhd2FpdCBhcGkuY2FsbChgY29udGFpbmVycy8ke2ZvbGRlcklkfS9saW5rc2ApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZmV0Y2hGaWxlQWNjZXNzTGlua3ModXBsb2FkSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIF9saW5rcy52YWx1ZSA9IGF3YWl0IGFwaS5jYWxsKGBzaGFyaW5nLyR7dXBsb2FkSWR9L2xpbmtzP3R5cGU9ZmlsZWApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gc2hhcmVJdGVtcyhcbiAgICBpdGVtc0FycmF5OiBJdGVtW10sXG4gICAgcGFzc3dvcmQ6IHN0cmluZyxcbiAgICBleHBpcmF0aW9uPzogc3RyaW5nXG4gICk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGxldCBzaG91bGRBZGRQYXNzd29yZEFzSGFzaCA9IGZhbHNlO1xuXG4gICAgaWYgKHBhc3N3b3JkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcGFzc3dvcmQgPSBVdGlsLmdlbmVyYXRlUmFuZG9tUGFzc3dvcmQoKTtcbiAgICAgIHNob3VsZEFkZFBhc3N3b3JkQXNIYXNoID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBsZXQgdXJsID0gYXdhaXQgc2hhcmVyLnNoYXJlSXRlbXNXaXRoUGFzc3dvcmQoXG4gICAgICBpdGVtc0FycmF5LFxuICAgICAgcGFzc3dvcmQsXG4gICAgICBleHBpcmF0aW9uXG4gICAgKTtcblxuICAgIGlmICghdXJsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoc2hvdWxkQWRkUGFzc3dvcmRBc0hhc2gpIHtcbiAgICAgIHVybCA9IGAke3VybH0jJHtwYXNzd29yZH1gO1xuICAgIH1cblxuICAgIHJldHVybiB1cmw7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBnZXRTaGFyZWRGb2xkZXIoaGFzaDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsPEZvbGRlclJlc3BvbnNlPihgc2hhcmluZy8ke2hhc2h9L2ApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZ2V0SW52aXRhdGlvbnModXNlcklkOiBudW1iZXIpIHtcbiAgICAvLyBUT0RPOiBzaGlmdCB0aGUgdXNlcklkIGZyb20gZnJvbnRlbmQgYXJndW1lbnQgdG8gYmFja2VuZCBzZXNzaW9uXG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsKGB1c2Vycy8ke3VzZXJJZH0vaW52aXRhdGlvbnMvYCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBnZXRGb2xkZXJzU2hhcmVkV2l0aFVzZXIodXNlcklkOiBzdHJpbmcpIHtcbiAgICAvLyBUT0RPOiBzaGlmdCB0aGUgdXNlcklkIGZyb20gZnJvbnRlbmQgYXJndW1lbnQgdG8gYmFja2VuZCBzZXNzaW9uXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICByZXR1cm4gYXdhaXQgYXBpLmNhbGw8eyBba2V5OiBzdHJpbmddOiBhbnkgfVtdPihcbiAgICAgIGB1c2Vycy8ke3VzZXJJZH0vZm9sZGVycy9zaGFyZWRXaXRoVXNlcmBcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZ2V0Rm9sZGVyc1NoYXJlZEJ5VXNlcih1c2VySWQ6IHN0cmluZykge1xuICAgIC8vIFRPRE86IHNoaWZ0IHRoZSB1c2VySWQgZnJvbSBmcm9udGVuZCBhcmd1bWVudCB0byBiYWNrZW5kIHNlc3Npb25cbiAgICByZXR1cm4gYXdhaXQgYXBpLmNhbGwoYHVzZXJzLyR7dXNlcklkfS9mb2xkZXJzL3NoYXJlZEJ5VXNlcmApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gZ2V0U2hhcmVzRm9yRm9sZGVyKGNvbnRhaW5lcklkOiBudW1iZXIsIHVzZXJJZDogbnVtYmVyKSB7XG4gICAgLy8gVE9ETzogc2hpZnQgdGhlIHVzZXJJZCBmcm9tIGZyb250ZW5kIGFyZ3VtZW50IHRvIGJhY2tlbmQgc2Vzc2lvblxuICAgIHJldHVybiBhd2FpdCBhcGkuY2FsbChgY29udGFpbmVycy8ke2NvbnRhaW5lcklkfS9zaGFyZXNgLCB7XG4gICAgICB1c2VySWQsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBhY2NlcHRJbnZpdGF0aW9uKGludml0YXRpb25JZDogbnVtYmVyLCBjb250YWluZXJJZDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsKFxuICAgICAgYGNvbnRhaW5lcnMvJHtjb250YWluZXJJZH0vbWVtYmVyL2FjY2VwdC8ke2ludml0YXRpb25JZH1gLFxuICAgICAge30sXG4gICAgICAnUE9TVCdcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gdXBkYXRlSW52aXRhdGlvblBlcm1pc3Npb25zKFxuICAgIGNvbnRhaW5lcklkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgaW52aXRhdGlvbklkOiBudW1iZXIsXG4gICAgcGVybWlzc2lvbjogbnVtYmVyXG4gICkge1xuICAgIHJldHVybiBhd2FpdCBhcGkuY2FsbChcbiAgICAgIGBjb250YWluZXJzLyR7Y29udGFpbmVySWR9L3NoYXJlcy9pbnZpdGF0aW9uL3VwZGF0ZWAsXG4gICAgICB7IHVzZXJJZCwgaW52aXRhdGlvbklkLCBwZXJtaXNzaW9uIH0sXG4gICAgICAnUE9TVCdcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gdXBkYXRlQWNjZXNzTGlua1Blcm1pc3Npb25zKFxuICAgIGNvbnRhaW5lcklkOiBudW1iZXIsXG4gICAgdXNlcklkOiBudW1iZXIsXG4gICAgYWNjZXNzTGlua0lkOiBzdHJpbmcsXG4gICAgcGVybWlzc2lvbjogbnVtYmVyXG4gICkge1xuICAgIHJldHVybiBhd2FpdCBhcGkuY2FsbChcbiAgICAgIGBjb250YWluZXJzLyR7Y29udGFpbmVySWR9L3NoYXJlcy9hY2Nlc3NMaW5rL3VwZGF0ZWAsXG4gICAgICB7IHVzZXJJZCwgYWNjZXNzTGlua0lkLCBwZXJtaXNzaW9uIH0sXG4gICAgICAnUE9TVCdcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAvLyBHZXR0ZXJzID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgICBsaW5rcyxcblxuICAgIC8vIEFjdGlvbnMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGNyZWF0ZUFjY2Vzc0xpbmssXG4gICAgaXNBY2Nlc3NMaW5rVmFsaWQsXG4gICAgYWNjZXB0QWNjZXNzTGluayxcbiAgICBmZXRjaEZvbGRlckFjY2Vzc0xpbmtzLFxuICAgIGZldGNoRmlsZUFjY2Vzc0xpbmtzLFxuICAgIHNoYXJlSXRlbXMsXG4gICAgZ2V0U2hhcmVkRm9sZGVyLFxuICAgIGdldEludml0YXRpb25zLFxuICAgIGdldEZvbGRlcnNTaGFyZWRXaXRoVXNlcixcbiAgICBnZXRGb2xkZXJzU2hhcmVkQnlVc2VyLFxuICAgIGdldFNoYXJlc0ZvckZvbGRlcixcbiAgICBhY2NlcHRJbnZpdGF0aW9uLFxuICAgIHVwZGF0ZUludml0YXRpb25QZXJtaXNzaW9ucyxcbiAgICB1cGRhdGVBY2Nlc3NMaW5rUGVybWlzc2lvbnMsXG4gIH07XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgdXNlU2hhcmluZ1N0b3JlO1xuIl0sIm5hbWVzIjpbImdldENvbnRhaW5lcktleUZyb21DaGFsbGVuZ2UiLCJoYXNoIiwicGFzc3dvcmQiLCJhcGkiLCJrZXljaGFpbiIsInJlc3AiLCJjaGFsbGVuZ2VLZXlTdHIiLCJjaGFsbGVuZ2VTYWx0U3RyIiwiY2hhbGxlbmdlQ2lwaGVydGV4dCIsImNoYWxsZW5nZVNhbHQiLCJVdGlsIiwidW53cmFwcGVkQ2hhbGxlbmdlS2V5IiwiY2hhbGxlbmdlUGxhaW50ZXh0IiwiY2hhbGxlbmdlUmVzcCIsImNvbnRhaW5lcklkIiwid3JhcHBlZEtleVN0ciIsInNhbHRTdHIiLCJlIiwiU2hhcmVyIiwidXNlciIsIml0ZW0iLCJpZHMiLCJ1IiwiX2l0ZW1zIiwiaXRlbXMiLCJleHBpcmF0aW9uIiwiX19pdGVtcyIsImVtYWlsIiwicHVibGljS2V5IiwicmVjaXBpZW50SWQiLCJpbXBvcnRlZFB1YmxpY0tleSIsImtleSIsIndyYXBwZWRLZXkiLCJfYSIsIl9iIiwiaXRlbXNUb1NoYXJlIiwiY3VycmVudENvbnRhaW5lciIsInJlc3BvbnNlIiwiQ09OVEFJTkVSX1RZUEUiLCJfYyIsIm5ld0NvbnRhaW5lcklkIiwiZmlsZW5hbWUiLCJjdXJyZW50V3JhcHBpbmdLZXkiLCJ1cGxvYWRJZCIsInR5cGUiLCJjb250ZW50S2V5IiwibmV3V3JhcHBpbmdLZXkiLCJjYW5DcmVhdGVMaW5rIiwidW53cmFwcGVkS2V5Iiwic2FsdCIsInBhc3N3b3JkV3JhcHBlZEtleVN0ciIsImNoYWxsZW5nZUtleSIsInBhc3N3b3JkV3JhcHBlZENoYWxsZW5nZUtleVN0ciIsInVzZVNoYXJpbmdTdG9yZSIsImRlZmluZVN0b3JlIiwidXNlQXBpU3RvcmUiLCJ1c2VVc2VyU3RvcmUiLCJ1c2VLZXljaGFpblN0b3JlIiwic2hhcmVyIiwiX2xpbmtzIiwicmVmIiwibGlua3MiLCJjb21wdXRlZCIsImNyZWF0ZUFjY2Vzc0xpbmsiLCJmb2xkZXJJZCIsInNob3VsZEFkZFBhc3N3b3JkQXNIYXNoIiwidXJsIiwiYWNjZXB0QWNjZXNzTGluayIsImxpbmtJZCIsImNvbnRhaW5lcktleSIsInRycGMiLCJpc0FjY2Vzc0xpbmtWYWxpZCIsImZldGNoRm9sZGVyQWNjZXNzTGlua3MiLCJmZXRjaEZpbGVBY2Nlc3NMaW5rcyIsInNoYXJlSXRlbXMiLCJpdGVtc0FycmF5IiwiZ2V0U2hhcmVkRm9sZGVyIiwiZ2V0SW52aXRhdGlvbnMiLCJ1c2VySWQiLCJnZXRGb2xkZXJzU2hhcmVkV2l0aFVzZXIiLCJnZXRGb2xkZXJzU2hhcmVkQnlVc2VyIiwiZ2V0U2hhcmVzRm9yRm9sZGVyIiwiYWNjZXB0SW52aXRhdGlvbiIsImludml0YXRpb25JZCIsInVwZGF0ZUludml0YXRpb25QZXJtaXNzaW9ucyIsInBlcm1pc3Npb24iLCJ1cGRhdGVBY2Nlc3NMaW5rUGVybWlzc2lvbnMiLCJhY2Nlc3NMaW5rSWQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR0EsZUFBc0JBLEVBQ3BCQyxHQUNBQyxHQUNBQyxHQUNBQyxHQUlRO0FBQ1IsUUFBTUMsSUFBTyxNQUFNRixFQUFJLEtBSXBCLFdBQVdGLENBQUksWUFBWTtBQUU5QixNQUFJLENBQUNJO0FBQ0gsV0FBTztBQUtULFFBQU07QUFBQSxJQUNKLGNBQWNDO0FBQUEsSUFDZCxlQUFlQztBQUFBLElBQ2YscUJBQUFDO0FBQUEsRUFBQSxJQUNFSDtBQUtKLE1BQUlJO0FBQ0osTUFBSTtBQUNGLElBQUFBLElBQWdCQyxFQUFLLG9CQUFvQkgsQ0FBZ0I7QUFBQSxFQUUzRCxRQUFZO0FBQ1YsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUFJO0FBRUYsVUFBTUksSUFDSixNQUFNUCxFQUFTLFNBQVM7QUFBQSxNQUN0QkU7QUFBQSxNQUNBSjtBQUFBLE1BQ0FPO0FBQUEsSUFBQSxHQUlFRyxJQUNKLE1BQU1SLEVBQVMsVUFBVTtBQUFBLE1BQ3ZCSTtBQUFBLE1BQ0FHO0FBQUEsTUFDQUY7QUFBQSxJQUFB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
