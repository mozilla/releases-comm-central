import { U as K, C as $, d as A, u as T, a as O, b as v, c as E, t as _, r as L } from "./background-CTHpSNy3.js";
import { e as N, f as U, g as H, h as D, i as q } from "./background-CTHpSNy3.js";
(function() {
  try {
    var a = typeof window < "u" ? window : typeof global < "u" ? global : typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : {};
    a.SENTRY_RELEASE = { id: "8ebc1adf52b7a91ec7dacb1e5f25d89c8680d03f" }, a._sentryModuleMetadata = a._sentryModuleMetadata || {}, a._sentryModuleMetadata[new a.Error().stack] = (function(n) {
      for (var s = 1; s < arguments.length; s++) {
        var e = arguments[s];
        if (e != null) for (var c in e) e.hasOwnProperty(c) && (n[c] = e[c]);
      }
      return n;
    })({}, a._sentryModuleMetadata[new a.Error().stack], { version: "1.7.12", appHost: "background" });
    var r = new a.Error().stack;
    r && (a._sentryDebugIds = a._sentryDebugIds || {}, a._sentryDebugIds[r] = "2c5655af-fcab-4040-a2df-20a4b58f0b72", a._sentryDebugIdIdentifier = "sentry-dbid-2c5655af-fcab-4040-a2df-20a4b58f0b72");
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
    ), w = await n.call(
      `sharing/${a}/challenge`,
      {
        challengePlaintext: S
      },
      "POST"
    );
    if (!w.containerId)
      throw Error("Challenge unsuccessful");
    const {
      containerId: h,
      wrappedKey: k,
      salt: m
    } = w;
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
    var o, S, w;
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
    if (!((w = p.container) != null && w.id))
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
    ), w = this.keychain.challenge.createChallenge(), h = await this.keychain.challenge.encryptChallenge(
      w,
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
        challengePlaintext: w,
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
    let f = await s.requestAccessLink(t, i, d);
    return f ? (y && (f = `${f}#${i}`), f) : null;
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
    const { unwrappedKey: y, containerId: f } = d;
    return await n.rsa.generateKeyPair(), await n.add(f, y), await n.store(), !0;
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
  async function w(t, i, d) {
    let y = !1;
    i.length === 0 && (i = K.generateRandomPassword(), y = !0);
    let f = await s.shareItemsWithPassword(
      t,
      i,
      d
    );
    return f ? (y && (f = `${f}#${i}`), f) : null;
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
    shareItems: w,
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXgtQnBibGRicXMuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NlbmQvZnJvbnRlbmQvc3JjL2xpYi9jaGFsbGVuZ2UudHMiLCIuLi8uLi8uLi9zZW5kL2Zyb250ZW5kL3NyYy9saWIvc2hhcmUudHMiLCIuLi8uLi8uLi9zZW5kL2Zyb250ZW5kL3NyYy9hcHBzL3NlbmQvc3RvcmVzL3NoYXJpbmctc3RvcmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBpQ29ubmVjdGlvbiB9IGZyb20gJ0BzZW5kLWZyb250ZW5kL2xpYi9hcGknO1xuaW1wb3J0IHsgS2V5Y2hhaW4sIFV0aWwgfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIva2V5Y2hhaW4nO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q29udGFpbmVyS2V5RnJvbUNoYWxsZW5nZShcbiAgaGFzaDogc3RyaW5nLFxuICBwYXNzd29yZDogc3RyaW5nLFxuICBhcGk6IEFwaUNvbm5lY3Rpb24sXG4gIGtleWNoYWluOiBLZXljaGFpblxuKTogUHJvbWlzZTx7XG4gIHVud3JhcHBlZEtleTogQ3J5cHRvS2V5O1xuICBjb250YWluZXJJZDogc3RyaW5nO1xufSB8IG51bGw+IHtcbiAgY29uc3QgcmVzcCA9IGF3YWl0IGFwaS5jYWxsPHtcbiAgICBjaGFsbGVuZ2VLZXk6IHN0cmluZztcbiAgICBjaGFsbGVuZ2VTYWx0OiBzdHJpbmc7XG4gICAgY2hhbGxlbmdlQ2lwaGVydGV4dDogc3RyaW5nO1xuICB9Pihgc2hhcmluZy8ke2hhc2h9L2NoYWxsZW5nZWApO1xuXG4gIGlmICghcmVzcCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gU3RlcCAxOiByZWNlaXZlIHRoZSBjaGFsbGVuZ2UgaW5mbyxcbiAgLy8gcmVuYW1pbmcgZWFjaCBwcm9wZXJ0eSBzbyBpdCdzIGNsZWFyIHRoYXQgd2UncmUgd29ya2luZyB3aXRoIHN0cmluZ3MuXG4gIGNvbnN0IHtcbiAgICBjaGFsbGVuZ2VLZXk6IGNoYWxsZW5nZUtleVN0cixcbiAgICBjaGFsbGVuZ2VTYWx0OiBjaGFsbGVuZ2VTYWx0U3RyLFxuICAgIGNoYWxsZW5nZUNpcGhlcnRleHQsXG4gIH0gPSByZXNwO1xuXG4gIC8vIFN0ZXAgMjogY29udmVydCB0byBhcnJheSBidWZmZXJzLCBhcyBuZWNlc3NhcnkuXG4gIC8vIE9ubHkgdGhlIHNhbHQgbmVlZHMgdG8gYmUgY29udmVydGVkIHRvIGFuIGFycmF5IGJ1ZmZlci5cbiAgLy8gVGhpcyBpcyBoYW5kbGVkIGF1dG9tYXRpY2FsbHkgYnkga2V5Y2hhaW4ucGFzc3dvcmQudW53cmFwQ29udGVudEtleVxuICBsZXQgY2hhbGxlbmdlU2FsdDogQXJyYXlCdWZmZXJMaWtlO1xuICB0cnkge1xuICAgIGNoYWxsZW5nZVNhbHQgPSBVdGlsLmJhc2U2NFRvQXJyYXlCdWZmZXIoY2hhbGxlbmdlU2FsdFN0cik7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby11bnVzZWQtdmFyc1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIFN0ZXAgMzogdW53cmFwIHRoZSBjaGFsbGVuZ2Uga2V5IHVzaW5nIHRoZSBwYXNzd29yZFxuICAgIGNvbnN0IHVud3JhcHBlZENoYWxsZW5nZUtleTogQ3J5cHRvS2V5ID1cbiAgICAgIGF3YWl0IGtleWNoYWluLnBhc3N3b3JkLnVud3JhcENvbnRlbnRLZXkoXG4gICAgICAgIGNoYWxsZW5nZUtleVN0cixcbiAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgIGNoYWxsZW5nZVNhbHRcbiAgICAgICk7XG5cbiAgICAvLyBTdGVwIDQ6IGRlY3J5cHQgdGhlIGNoYWxsZW5nZSBjaXBoZXJ0ZXh0IGFuZCBzZW5kIGl0IGJhY2tcbiAgICBjb25zdCBjaGFsbGVuZ2VQbGFpbnRleHQ6IHN0cmluZyA9XG4gICAgICBhd2FpdCBrZXljaGFpbi5jaGFsbGVuZ2UuZGVjcnlwdENoYWxsZW5nZShcbiAgICAgICAgY2hhbGxlbmdlQ2lwaGVydGV4dCxcbiAgICAgICAgdW53cmFwcGVkQ2hhbGxlbmdlS2V5LFxuICAgICAgICBjaGFsbGVuZ2VTYWx0XG4gICAgICApO1xuXG4gICAgLy8gU3RlcCA1OiBwb3N0IHRoZSBjaGFsbGVuZ2UgdGV4dCB0byByZWNlaXZlOlxuICAgIC8vIC0gY29udGFpbmVySWRcbiAgICAvLyAtIHdyYXBwZWQgY29udGFpbmVyIGtleVxuICAgIC8vIC0gc2FsdCAoZm9yIHVud3JhcHBpbmcgY29udGFpbmVyIGtleSlcbiAgICBjb25zdCBjaGFsbGVuZ2VSZXNwID0gYXdhaXQgYXBpLmNhbGw8e1xuICAgICAgc3RhdHVzOiBzdHJpbmc7XG4gICAgICBjb250YWluZXJJZDogc3RyaW5nO1xuICAgICAgd3JhcHBlZEtleTogc3RyaW5nO1xuICAgICAgc2FsdDogc3RyaW5nO1xuICAgIH0+KFxuICAgICAgYHNoYXJpbmcvJHtoYXNofS9jaGFsbGVuZ2VgLFxuICAgICAge1xuICAgICAgICBjaGFsbGVuZ2VQbGFpbnRleHQsXG4gICAgICB9LFxuICAgICAgJ1BPU1QnXG4gICAgKTtcblxuICAgIGlmICghY2hhbGxlbmdlUmVzcC5jb250YWluZXJJZCkge1xuICAgICAgdGhyb3cgRXJyb3IoJ0NoYWxsZW5nZSB1bnN1Y2Nlc3NmdWwnKTtcbiAgICB9XG4gICAgY29uc3Qge1xuICAgICAgY29udGFpbmVySWQsXG4gICAgICB3cmFwcGVkS2V5OiB3cmFwcGVkS2V5U3RyLFxuICAgICAgc2FsdDogc2FsdFN0cixcbiAgICB9ID0gY2hhbGxlbmdlUmVzcDtcblxuICAgIC8vIFN0ZXAgNjogdW53cmFwIHRoZSBjb250YWluZXIga2V5IHVzaW5nIHRoZSBwYXNzd29yZFxuICAgIGNvbnN0IHVud3JhcHBlZEtleTogQ3J5cHRvS2V5ID0gYXdhaXQga2V5Y2hhaW4ucGFzc3dvcmQudW53cmFwQ29udGFpbmVyS2V5KFxuICAgICAgd3JhcHBlZEtleVN0cixcbiAgICAgIHBhc3N3b3JkLFxuICAgICAgVXRpbC5iYXNlNjRUb0FycmF5QnVmZmVyKHNhbHRTdHIpXG4gICAgKTtcblxuICAgIHJldHVybiB7IHVud3JhcHBlZEtleSwgY29udGFpbmVySWQgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUubG9nKGUpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG4iLCJpbXBvcnQge1xuICBGb2xkZXJSZXNwb25zZSxcbiAgSXRlbSxcbn0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvYXBwcy9zZW5kL3N0b3Jlcy9mb2xkZXItc3RvcmUudHlwZXMnO1xuaW1wb3J0IHsgQXBpQ29ubmVjdGlvbiB9IGZyb20gJ0BzZW5kLWZyb250ZW5kL2xpYi9hcGknO1xuaW1wb3J0IHsgQ09OVEFJTkVSX1RZUEUgfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIvY29uc3QnO1xuaW1wb3J0IHsgS2V5Y2hhaW4sIFV0aWwgfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIva2V5Y2hhaW4nO1xuaW1wb3J0IHsgVXNlclR5cGUgfSBmcm9tICdAc2VuZC1mcm9udGVuZC90eXBlcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNoYXJlciB7XG4gIHVzZXI6IFVzZXJUeXBlO1xuICBrZXljaGFpbjogS2V5Y2hhaW47XG4gIGFwaTogQXBpQ29ubmVjdGlvbjtcbiAgY29uc3RydWN0b3IodXNlcjogVXNlclR5cGUsIGtleWNoYWluOiBLZXljaGFpbiwgYXBpOiBBcGlDb25uZWN0aW9uKSB7XG4gICAgdGhpcy51c2VyID0gdXNlcjtcbiAgICB0aGlzLmtleWNoYWluID0ga2V5Y2hhaW47XG4gICAgdGhpcy5hcGkgPSBhcGk7XG4gIH1cblxuICBhc3luYyBoYW5kbGVNdWx0aXBhcnRJdGVtcyhpdGVtOiBJdGVtKTogUHJvbWlzZTxJdGVtW10+IHtcbiAgICBjb25zdCBfdXBsb2FkcyA9IGF3YWl0IHRoaXMuYXBpLmNhbGw8eyBpZDogc3RyaW5nOyBwYXJ0OiBudW1iZXIgfVtdPihcbiAgICAgIGB1cGxvYWRzL3BhcnRzYCxcbiAgICAgIHtcbiAgICAgICAgd3JhcHBlZEtleTogaXRlbS53cmFwcGVkS2V5LFxuICAgICAgfSxcbiAgICAgICdQT1NUJ1xuICAgICk7XG4gICAgY29uc3QgaWRzID0gX3VwbG9hZHMubWFwKCh1KSA9PiB1LmlkKTtcbiAgICBjb25zb2xlLmxvZyhgaWRzOmAsIGlkcyk7XG4gICAgY29uc3QgX2l0ZW1zID0gYXdhaXQgdGhpcy5hcGkuY2FsbDxJdGVtW10+KFxuICAgICAgYHVwbG9hZHMvaXRlbXNgLFxuICAgICAge1xuICAgICAgICBpZHMsXG4gICAgICAgIHdyYXBwZWRLZXk6IGl0ZW0ud3JhcHBlZEtleSxcbiAgICAgIH0sXG4gICAgICAnUE9TVCdcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKGBfaXRlbXM6YCwgX2l0ZW1zKTtcbiAgICByZXR1cm4gX2l0ZW1zO1xuICB9XG5cbiAgLy8gQ3JlYXRlcyBBY2Nlc3NMaW5rXG4gIGFzeW5jIHNoYXJlSXRlbXNXaXRoUGFzc3dvcmQoXG4gICAgaXRlbXM6IEl0ZW1bXSxcbiAgICBwYXNzd29yZDogc3RyaW5nLFxuICAgIGV4cGlyYXRpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgY29uc3QgX19pdGVtczogSXRlbVtdID0gW107XG4gICAgLy8gTG9vcCB0aHJvdWdoIHRoZSBpdGVtc1xuICAgIC8vIE11bHRpcGFydCBpdGVtcyBzaG91bGQgYmUgaGFuZGxlZCBieSBgaGFuZGxlTXVsdGlwYXJ0SXRlbXNgXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICBpZiAoaXRlbS5tdWx0aXBhcnQpIHtcbiAgICAgICAgY29uc3QgX2l0ZW1zID0gYXdhaXQgdGhpcy5oYW5kbGVNdWx0aXBhcnRJdGVtcyhpdGVtKTtcbiAgICAgICAgX19pdGVtcy5wdXNoKC4uLl9pdGVtcyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfX2l0ZW1zLnB1c2goaXRlbSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29udGFpbmVySWQgPSBhd2FpdCB0aGlzLmNyZWF0ZVNoYXJlT25seUNvbnRhaW5lcihfX2l0ZW1zLCBudWxsKTtcbiAgICByZXR1cm4gYXdhaXQgdGhpcy5yZXF1ZXN0QWNjZXNzTGluayhjb250YWluZXJJZCwgcGFzc3dvcmQsIGV4cGlyYXRpb24pO1xuICB9XG5cbiAgLy8gQ3JlYXRlcyBJbnZpdGF0aW9uXG4gIGFzeW5jIHNoYXJlQ29udGFpbmVyV2l0aEludml0YXRpb24oY29udGFpbmVySWQ6IHN0cmluZywgZW1haWw6IHN0cmluZykge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLmFwaS5jYWxsKGB1c2Vycy9sb29rdXAvJHtlbWFpbH0vYCk7XG5cbiAgICBpZiAodXNlcikge1xuICAgICAgbGV0IHB1YmxpY0tleSA9IHVzZXIucHVibGljS2V5O1xuICAgICAgY29uc3QgcmVjaXBpZW50SWQgPSB1c2VyLmlkO1xuICAgICAgaWYgKCFwdWJsaWNLZXkpIHtcbiAgICAgICAgY29uc29sZS5sb2coYENvdWxkIG5vdCBmaW5kIHB1YmxpYyBrZXkgZm9yIHVzZXIgJHtlbWFpbH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS53YXJuKCdTT01FVEhJTkcgV0VJUkQgSVMgSEFQUEVOSU5HIFdJVEggUFVCTElDIEtFWVMgT04gU0VSVkVSJyk7XG5cbiAgICAgIC8vIFRPRE86IG1ha2Ugc3VyZSB3ZSdyZSBub3QgZG91YmxlLWVzY2FwaW5nIGJlZm9yZSBzdG9yaW5nIG9uIHNlcnZlclxuICAgICAgd2hpbGUgKHR5cGVvZiBwdWJsaWNLZXkgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHB1YmxpY0tleSA9IEpTT04ucGFyc2UocHVibGljS2V5KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW1wb3J0ZWRQdWJsaWNLZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICAgICAgJ2p3aycsXG4gICAgICAgIHB1YmxpY0tleSxcbiAgICAgICAge1xuICAgICAgICAgIG5hbWU6ICdSU0EtT0FFUCcsXG4gICAgICAgICAgaGFzaDogeyBuYW1lOiAnU0hBLTI1NicgfSxcbiAgICAgICAgfSxcbiAgICAgICAgdHJ1ZSxcbiAgICAgICAgWyd3cmFwS2V5J11cbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGtleSA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uZ2V0KGNvbnRhaW5lcklkKTtcbiAgICAgIGNvbnN0IHdyYXBwZWRLZXkgPSBhd2FpdCB0aGlzLmtleWNoYWluLnJzYS53cmFwQ29udGFpbmVyS2V5KFxuICAgICAgICBrZXksXG4gICAgICAgIGltcG9ydGVkUHVibGljS2V5XG4gICAgICApO1xuXG4gICAgICBpZiAoIXdyYXBwZWRLZXkpIHtcbiAgICAgICAgY29uc29sZS5sb2coYG5vIHdyYXBwZWQga2V5IGZvciB0aGUgaW52aXRhdGlvbmApO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzcCA9IGF3YWl0IHRoaXMuYXBpLmNhbGwoXG4gICAgICAgIGBjb250YWluZXJzLyR7Y29udGFpbmVySWR9L21lbWJlci9pbnZpdGVgLFxuICAgICAgICB7XG4gICAgICAgICAgd3JhcHBlZEtleSxcbiAgICAgICAgICByZWNpcGllbnRJZCxcbiAgICAgICAgICBzZW5kZXJJZDogdGhpcy51c2VyLmlkLFxuICAgICAgICB9LFxuICAgICAgICAnUE9TVCdcbiAgICAgICk7XG4gICAgICBjb25zb2xlLmxvZyhgSW52aXRhdGlvbiBjcmVhdGlvbiByZXNwb25zZTpgKTtcbiAgICAgIGNvbnNvbGUubG9nKHJlc3ApO1xuICAgICAgcmV0dXJuIHJlc3A7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlU2hhcmVPbmx5Q29udGFpbmVyKFxuICAgIGl0ZW1zID0gW10sXG4gICAgY29udGFpbmVySWQgPSBudWxsXG4gICk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGlmIChpdGVtcy5sZW5ndGggPT09IDAgJiYgIWNvbnRhaW5lcklkKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBBcmJpdHJhcmlseSBwaWNrZWQga2V5Y2hhaW4udmFsdWUuc3RvcmUgdG9cbiAgICAvLyBjb25maXJtIHByZXNlbmNlIG9mIGtleWNoYWluXG4gICAgaWYgKCF0aGlzLmFwaT8uY2FsbCB8fCAhdGhpcy5rZXljaGFpbj8uc3RvcmUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW1zVG9TaGFyZSA9IFsuLi5pdGVtc107XG5cbiAgICBsZXQgY3VycmVudENvbnRhaW5lciA9IHsgbmFtZTogJ2RlZmF1bHQnIH07XG4gICAgaWYgKGNvbnRhaW5lcklkKSB7XG4gICAgICBjdXJyZW50Q29udGFpbmVyID0gYXdhaXQgdGhpcy5hcGkuY2FsbChgY29udGFpbmVycy8ke2NvbnRhaW5lcklkfS9pbmZvYCk7XG4gICAgICAvLyBUT0RPOiBmdXR1cmUgZW5oYW5jZW1lbnRcbiAgICAgIC8vIElmIHRoZXJlIGFyZSBubyBpdGVtc1RvU2hhcmUsIGdldCB0aGUgaXRlbXMgZnJvbSB0aGUgYGN1cnJlbnRDb250YWluZXJgXG4gICAgICAvLyBpZiAoaXRlbXNUb1NoYXJlLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGNvbnN0IHsgaXRlbXMgfSA9IGF3YWl0IGFwaS5nZXRDb250YWluZXJXaXRoSXRlbXMoY29udGFpbmVySWQpO1xuICAgICAgLy8gaXRlbXNUb1NoYXJlID0gaXRlbXM7XG4gICAgICAvLyB9XG4gICAgfVxuXG4gICAgLy8gQSBzaGFyZS1vbmx5IEZvbGRlciBzaG91bGRuJ3QgaGF2ZSBhIHBhcmVudElkXG4gICAgY29uc3QgcGFyZW50SWQgPSAwO1xuICAgIGNvbnN0IHNoYXJlT25seSA9IHRydWU7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuYXBpLmNhbGw8eyBjb250YWluZXI6IEZvbGRlclJlc3BvbnNlIH0+KFxuICAgICAgYGNvbnRhaW5lcnNgLFxuICAgICAge1xuICAgICAgICBuYW1lOiBjdXJyZW50Q29udGFpbmVyLm5hbWUsXG4gICAgICAgIHR5cGU6IENPTlRBSU5FUl9UWVBFLkZPTERFUixcbiAgICAgICAgcGFyZW50SWQsXG4gICAgICAgIHNoYXJlT25seSxcbiAgICAgIH0sXG4gICAgICAnUE9TVCdcbiAgICApO1xuICAgIGlmICghcmVzcG9uc2UuY29udGFpbmVyPy5pZCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IHsgaWQ6IG5ld0NvbnRhaW5lcklkIH0gPSByZXNwb25zZS5jb250YWluZXI7XG5cbiAgICBhd2FpdCB0aGlzLmtleWNoYWluLm5ld0tleUZvckNvbnRhaW5lcihuZXdDb250YWluZXJJZCk7XG4gICAgYXdhaXQgdGhpcy5rZXljaGFpbi5zdG9yZSgpO1xuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBpdGVtc1RvU2hhcmUubWFwKGFzeW5jIChpdGVtKSA9PiB7XG4gICAgICAgIC8vIFRPRE86IGxvY2F0ZSBzb3VyY2Ugb2YgXCJmb2xkZXJJZFwiIHByb3BlcnR5XG4gICAgICAgIC8vIHJlbmFtZSB0byBtb3JlIGdlbmVyaWMgXCJjb250YWluZXJJZFwiXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lcklkID0gaXRlbS5jb250YWluZXJJZCA/PyBpdGVtLmZvbGRlcklkO1xuICAgICAgICAvLyBUT0RPOiBsb2NhdGUgc291cmNlIG9mIFwiZmlsZW5hbWVcIiBwcm9wZXJ0eVxuICAgICAgICAvLyByZW5hbWUgdG8gbW9yZSBnZW5lcmljIFwibmFtZVwiXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gaXRlbS5uYW1lID8/IGl0ZW0uZmlsZW5hbWU7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRXcmFwcGluZ0tleSA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uZ2V0KGNvbnRhaW5lcklkKTtcbiAgICAgICAgY29uc3QgeyB1cGxvYWRJZCwgd3JhcHBlZEtleSwgdHlwZSB9ID0gaXRlbTtcbiAgICAgICAgY29uc3QgY29udGVudEtleSA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uY29udGFpbmVyLnVud3JhcENvbnRlbnRLZXkoXG4gICAgICAgICAgd3JhcHBlZEtleSxcbiAgICAgICAgICBjdXJyZW50V3JhcHBpbmdLZXlcbiAgICAgICAgKTtcblxuICAgICAgICAvLyB3cmFwIHRoZSBjb250ZW50IGtleSB3aXRoIHRoZSBuZXcgY29udGFpbmVyIGtleVxuICAgICAgICBjb25zdCBuZXdXcmFwcGluZ0tleSA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uZ2V0KG5ld0NvbnRhaW5lcklkKTtcblxuICAgICAgICBjb25zdCB3cmFwcGVkS2V5U3RyID0gYXdhaXQgdGhpcy5rZXljaGFpbi5jb250YWluZXIud3JhcENvbnRlbnRLZXkoXG4gICAgICAgICAgY29udGVudEtleSxcbiAgICAgICAgICBuZXdXcmFwcGluZ0tleVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIGNyZWF0ZSB0aGUgbmV3IGl0ZW0gd2l0aCB0aGUgZXhpc3RpbmcgdXBsb2FkSWRcbiAgICAgICAgLy8gaW4gdGhlIG5ld0NvbnRhaW5lclxuXG4gICAgICAgIGNvbnN0IGl0ZW1SZXNwID0gYXdhaXQgdGhpcy5hcGkuY2FsbChcbiAgICAgICAgICBgY29udGFpbmVycy8ke25ld0NvbnRhaW5lcklkfS9pdGVtYCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cGxvYWRJZCxcbiAgICAgICAgICAgIG5hbWU6IGZpbGVuYW1lLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIHdyYXBwZWRLZXk6IHdyYXBwZWRLZXlTdHIsXG4gICAgICAgICAgICBtdWx0aXBhcnQ6IGl0ZW0ubXVsdGlwYXJ0ID8/IGZhbHNlLFxuICAgICAgICAgICAgdG90YWxTaXplOiBpdGVtLnRvdGFsU2l6ZSA/PyB1bmRlZmluZWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICAnUE9TVCdcbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gaXRlbVJlc3A7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICByZXR1cm4gbmV3Q29udGFpbmVySWQ7XG4gIH1cblxuICBhc3luYyByZXF1ZXN0QWNjZXNzTGluayhcbiAgICBjb250YWluZXJJZDogc3RyaW5nLFxuICAgIHBhc3N3b3JkPzogc3RyaW5nLFxuICAgIGV4cGlyYXRpb24/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgLy8gY2hlY2sgaWYgdGhlIGNvbnRhaW5lciBkb2Vzbid0IGhhdmUgcmVwb3J0ZWQgaXRlbXMgZmlyc3RcbiAgICBjb25zdCBjYW5DcmVhdGVMaW5rID0gYXdhaXQgdGhpcy5hcGkuY2FsbDx7IGNhbkNyZWF0ZUxpbms6IGJvb2xlYW4gfT4oXG4gICAgICBgc2hhcmluZy8ke2NvbnRhaW5lcklkfS9jYW5DcmVhdGVBY2Nlc3NMaW5rYFxuICAgICk7XG5cbiAgICBpZiAoIWNhbkNyZWF0ZUxpbms/LmNhbkNyZWF0ZUxpbmspIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ0Nhbm5vdCBjcmVhdGUgYWNjZXNzIGxpbmsgZm9yIHRoaXMgY29udGFpbmVyIGJlY2F1c2UgaXQgY29udGFpbnMgZmlsZXMgdGhhdCBoYXZlIGJlZW4gcmVwb3J0ZWQgZm9yIGFidXNlLidcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gZ2V0IHRoZSBrZXkgKHdoaWNoIHVud3JhcHMgaXQpLFxuICAgIGNvbnN0IHVud3JhcHBlZEtleSA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uZ2V0KGNvbnRhaW5lcklkKTtcblxuICAgIC8vIGFuZCBwYXNzd29yZCBwcm90ZWN0IGl0XG4gICAgY29uc3Qgc2FsdCA9IFV0aWwuZ2VuZXJhdGVTYWx0KCk7XG4gICAgY29uc3QgcGFzc3dvcmRXcmFwcGVkS2V5U3RyID0gYXdhaXQgdGhpcy5rZXljaGFpbi5wYXNzd29yZC53cmFwQ29udGFpbmVyS2V5KFxuICAgICAgdW53cmFwcGVkS2V5LFxuICAgICAgcGFzc3dvcmQsXG4gICAgICAvL0B0cy1pZ25vcmVcbiAgICAgIHNhbHRcbiAgICApO1xuXG4gICAgY29uc3QgY2hhbGxlbmdlS2V5ID0gYXdhaXQgdGhpcy5rZXljaGFpbi5jaGFsbGVuZ2UuZ2VuZXJhdGVLZXkoKTtcbiAgICBjb25zdCBjaGFsbGVuZ2VTYWx0ID0gVXRpbC5nZW5lcmF0ZVNhbHQoKTtcblxuICAgIGNvbnN0IHBhc3N3b3JkV3JhcHBlZENoYWxsZW5nZUtleVN0ciA9XG4gICAgICBhd2FpdCB0aGlzLmtleWNoYWluLnBhc3N3b3JkLndyYXBDb250ZW50S2V5KFxuICAgICAgICBjaGFsbGVuZ2VLZXksXG4gICAgICAgIHBhc3N3b3JkLFxuICAgICAgICAvL0B0cy1pZ25vcmVcbiAgICAgICAgY2hhbGxlbmdlU2FsdFxuICAgICAgKTtcblxuICAgIGNvbnN0IGNoYWxsZW5nZVBsYWludGV4dCA9IHRoaXMua2V5Y2hhaW4uY2hhbGxlbmdlLmNyZWF0ZUNoYWxsZW5nZSgpO1xuXG4gICAgY29uc3QgY2hhbGxlbmdlQ2lwaGVydGV4dCA9IGF3YWl0IHRoaXMua2V5Y2hhaW4uY2hhbGxlbmdlLmVuY3J5cHRDaGFsbGVuZ2UoXG4gICAgICBjaGFsbGVuZ2VQbGFpbnRleHQsXG4gICAgICBjaGFsbGVuZ2VLZXksXG4gICAgICAvL0B0cy1pZ25vcmVcbiAgICAgIGNoYWxsZW5nZVNhbHRcbiAgICApO1xuXG4gICAgLy8gY29udmVydCBzYWx0cyB0byBiYXNlNjQgc3RyaW5nc1xuICAgIGNvbnN0IHNhbHRTdHIgPSBVdGlsLmFycmF5QnVmZmVyVG9CYXNlNjQoc2FsdCk7XG4gICAgY29uc3QgY2hhbGxlbmdlU2FsdFN0ciA9IFV0aWwuYXJyYXlCdWZmZXJUb0Jhc2U2NChjaGFsbGVuZ2VTYWx0KTtcblxuICAgIGNvbnN0IHJlc3AgPSBhd2FpdCB0aGlzLmFwaS5jYWxsPHsgaWQ6IHN0cmluZzsgZXhwaXJ5RGF0ZTogc3RyaW5nIHwgbnVsbCB9PihcbiAgICAgIGBzaGFyaW5nYCxcbiAgICAgIHtcbiAgICAgICAgY29udGFpbmVySWQsXG4gICAgICAgIHdyYXBwZWRLZXk6IHBhc3N3b3JkV3JhcHBlZEtleVN0cixcbiAgICAgICAgc2FsdDogc2FsdFN0cixcbiAgICAgICAgY2hhbGxlbmdlS2V5OiBwYXNzd29yZFdyYXBwZWRDaGFsbGVuZ2VLZXlTdHIsXG4gICAgICAgIGNoYWxsZW5nZVNhbHQ6IGNoYWxsZW5nZVNhbHRTdHIsXG4gICAgICAgIHNlbmRlcklkOiB0aGlzLnVzZXIuaWQsXG4gICAgICAgIGNoYWxsZW5nZVBsYWludGV4dCxcbiAgICAgICAgY2hhbGxlbmdlQ2lwaGVydGV4dCxcbiAgICAgICAgZXhwaXJhdGlvbixcbiAgICAgIH0sXG4gICAgICAnUE9TVCdcbiAgICApO1xuXG4gICAgaWYgKCFyZXNwPy5pZCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgYWNjZXNzTGluayA9IHJlc3AuaWQ7XG4gICAgLy8gY29uc3QgdXJsID0gYCR7b3JpZ2lufS9zaGFyZS8ke2FjY2Vzc0xpbmt9YDtcbiAgICAvLyBUT0RPOiBuZWVkIHRoZSBzZXJ2ZXIgdXJsIGZyb20uLi5lbHNld2hlcmVcbiAgICAvLyBVc2luZyBgb3JpZ2luYCB3b3JrcyBmaW5lIGZvciB3ZWIgYXBwbGljYXRpb24sIGJ1dCBub3QgZm9yIGV4dGVuc2lvblxuICAgIGNvbnN0IHVybCA9IGAke2ltcG9ydC5tZXRhLmVudi5WSVRFX1NFTkRfQ0xJRU5UX1VSTH0vc2hhcmUvJHthY2Nlc3NMaW5rfWA7XG4gICAgcmV0dXJuIHVybDtcbiAgfVxufVxuIiwiaW1wb3J0IHtcbiAgRm9sZGVyUmVzcG9uc2UsXG4gIEl0ZW0sXG59IGZyb20gJ0BzZW5kLWZyb250ZW5kL2FwcHMvc2VuZC9zdG9yZXMvZm9sZGVyLXN0b3JlLnR5cGVzJztcbmltcG9ydCB7IGdldENvbnRhaW5lcktleUZyb21DaGFsbGVuZ2UgfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIvY2hhbGxlbmdlJztcbmltcG9ydCB7IEtleWNoYWluLCBVdGlsIH0gZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL2tleWNoYWluJztcbmltcG9ydCBTaGFyZXIgZnJvbSAnQHNlbmQtZnJvbnRlbmQvbGliL3NoYXJlJztcbmltcG9ydCB7IHRycGMgfSBmcm9tICdAc2VuZC1mcm9udGVuZC9saWIvdHJwYyc7XG5pbXBvcnQgdXNlQXBpU3RvcmUgZnJvbSAnQHNlbmQtZnJvbnRlbmQvc3RvcmVzL2FwaS1zdG9yZSc7XG5pbXBvcnQgdXNlS2V5Y2hhaW5TdG9yZSBmcm9tICdAc2VuZC1mcm9udGVuZC9zdG9yZXMva2V5Y2hhaW4tc3RvcmUnO1xuaW1wb3J0IHVzZVVzZXJTdG9yZSBmcm9tICdAc2VuZC1mcm9udGVuZC9zdG9yZXMvdXNlci1zdG9yZSc7XG5pbXBvcnQgeyBVc2VyVHlwZSB9IGZyb20gJ0BzZW5kLWZyb250ZW5kL3R5cGVzJztcbmltcG9ydCB7IGRlZmluZVN0b3JlIH0gZnJvbSAncGluaWEnO1xuaW1wb3J0IHsgY29tcHV0ZWQsIHJlZiB9IGZyb20gJ3Z1ZSc7XG5cbnR5cGUgQWNjZXNzTGlua3MgPSB7XG4gIGlkOiBzdHJpbmc7XG4gIGV4cGlyeURhdGU6IERhdGUgfCBudWxsO1xuICBwYXNzd29yZEhhc2g6IHN0cmluZztcbiAgbG9ja2VkOiBib29sZWFuO1xufVtdO1xuXG5jb25zdCB1c2VTaGFyaW5nU3RvcmUgPSBkZWZpbmVTdG9yZSgnc2hhcmluZ01hbmFnZXInLCAoKSA9PiB7XG4gIGNvbnN0IHsgYXBpIH0gPSB1c2VBcGlTdG9yZSgpO1xuICBjb25zdCB7IHVzZXIgfSA9IHVzZVVzZXJTdG9yZSgpO1xuICBjb25zdCB7IGtleWNoYWluIH0gPSB1c2VLZXljaGFpblN0b3JlKCk7XG5cbiAgY29uc3Qgc2hhcmVyID0gbmV3IFNoYXJlcih1c2VyIGFzIFVzZXJUeXBlLCBrZXljaGFpbiBhcyBLZXljaGFpbiwgYXBpKTtcblxuICBjb25zdCBfbGlua3MgPSByZWY8QWNjZXNzTGlua3M+KFtdKTtcblxuICBjb25zdCBsaW5rcyA9IGNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gWy4uLl9saW5rcy52YWx1ZV07XG4gIH0pO1xuXG4gIGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUFjY2Vzc0xpbmsoXG4gICAgZm9sZGVySWQ6IHN0cmluZyxcbiAgICBwYXNzd29yZDogc3RyaW5nLFxuICAgIGV4cGlyYXRpb246IHN0cmluZ1xuICApOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBsZXQgc2hvdWxkQWRkUGFzc3dvcmRBc0hhc2ggPSBmYWxzZTtcblxuICAgIGlmIChwYXNzd29yZC5sZW5ndGggPT09IDApIHtcbiAgICAgIHBhc3N3b3JkID0gVXRpbC5nZW5lcmF0ZVJhbmRvbVBhc3N3b3JkKCk7XG4gICAgICBzaG91bGRBZGRQYXNzd29yZEFzSGFzaCA9IHRydWU7XG4gICAgfVxuXG4gICAgbGV0IHVybCA9IGF3YWl0IHNoYXJlci5yZXF1ZXN0QWNjZXNzTGluayhmb2xkZXJJZCwgcGFzc3dvcmQsIGV4cGlyYXRpb24pO1xuXG4gICAgaWYgKCF1cmwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChzaG91bGRBZGRQYXNzd29yZEFzSGFzaCkge1xuICAgICAgdXJsID0gYCR7dXJsfSMke3Bhc3N3b3JkfWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHVybDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGFjY2VwdEFjY2Vzc0xpbmsoXG4gICAgbGlua0lkOiBzdHJpbmcsXG4gICAgcGFzc3dvcmQ6IHN0cmluZ1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBjb250YWluZXJLZXkgPSBhd2FpdCBnZXRDb250YWluZXJLZXlGcm9tQ2hhbGxlbmdlKFxuICAgICAgbGlua0lkLFxuICAgICAgcGFzc3dvcmQsXG4gICAgICBhcGksXG4gICAgICBrZXljaGFpbiBhcyBLZXljaGFpblxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgcGFzc3dvcmQgaXMgaW5jb3JyZWN0LCBpbmNyZW1lbnQgdGhlIHBhc3N3b3JkIHJldHJ5IGNvdW50LlxuICAgIGlmICghY29udGFpbmVyS2V5Py51bndyYXBwZWRLZXkpIHtcbiAgICAgIGF3YWl0IHRycGMuaW5jcmVtZW50UGFzc3dvcmRSZXRyeUNvdW50Lm11dGF0ZSh7XG4gICAgICAgIGxpbmtJZCxcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZm9yIGV4aXN0ZW5jZSBvZiBsaW5rLlxuICAgIGNvbnN0IHsgdW53cmFwcGVkS2V5LCBjb250YWluZXJJZCB9ID0gY29udGFpbmVyS2V5O1xuICAgIGF3YWl0IGtleWNoYWluLnJzYS5nZW5lcmF0ZUtleVBhaXIoKTtcblxuICAgIC8vIFRoaXMgYmxvY2sgaXMgbm90IHVzZWQgY3VycmVudGx5LCBpdCdzIG1lYW50IHRvIG1ha2UgdGhlIHVzZXIgYSBtZW1iZXIgb2YgdGhlIHNoYXJlZCBjb250YWluZXJcbiAgICAvLyBpZiAodXNlci5pZCkge1xuICAgIC8vICAgLy8gLy8gVXNlIHRoZSBBY2Nlc3NMaW5rIHRvIG1ha2UgdGhlIFVzZXIgYSBtZW1iZXIgb2YgdGhlIHNoYXJlZCBmb2xkZXIuXG4gICAgLy8gICAvLyBjb25zdCBhY2NlcHRBY2Nlc3NMaW5rUmVzcCA9IGF3YWl0IGFwaS5jYWxsKFxuICAgIC8vICAgLy8gICBgc2hhcmluZy8ke2xpbmtJZH0vbWVtYmVyL2FjY2VwdGAsXG4gICAgLy8gICAvLyAgIHt9LFxuICAgIC8vICAgLy8gICAnUE9TVCdcbiAgICAvLyAgIC8vICk7XG4gICAgLy8gICAvLyBpZiAoIWFjY2VwdEFjY2Vzc0xpbmtSZXNwKSB7XG4gICAgLy8gICAvLyAgIHJldHVybiBmYWxzZTtcbiAgICAvLyAgIC8vIH1cbiAgICAvLyB9IGVsc2Uge1xuICAgIC8vICAgLy8gVE9ETzogY29uc2lkZXIgc3dpdGNoaW5nIHRvIHNlc3Npb25TdG9yYWdlLlxuICAgIC8vICAgLy8gR2VuZXJhdGUgYSB0ZW1wb3Jhcnkga2V5cGFpciBmb3IgZW5jcnlwdGluZyBjb250YWluZXJLZXkgaW4ga2V5Y2hhaW4uXG4gICAgLy8gICAvLyBhd2FpdCBrZXljaGFpbi5yc2EuZ2VuZXJhdGVLZXlQYWlyKCk7XG4gICAgLy8gfVxuXG4gICAgYXdhaXQga2V5Y2hhaW4uYWRkKGNvbnRhaW5lcklkLCB1bndyYXBwZWRLZXkpO1xuICAgIGF3YWl0IGtleWNoYWluLnN0b3JlKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBpc0FjY2Vzc0xpbmtWYWxpZChsaW5rSWQ6IHN0cmluZyk6IFByb21pc2U8eyBpZDogc3RyaW5nIH0+IHtcbiAgICByZXR1cm4gYXdhaXQgYXBpLmNhbGw8eyBpZDogc3RyaW5nIH0+KGBzaGFyaW5nL2V4aXN0cy8ke2xpbmtJZH1gKTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGZldGNoRm9sZGVyQWNjZXNzTGlua3MoZm9sZGVySWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIF9saW5rcy52YWx1ZSA9IGF3YWl0IGFwaS5jYWxsKGBjb250YWluZXJzLyR7Zm9sZGVySWR9L2xpbmtzYCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBmZXRjaEZpbGVBY2Nlc3NMaW5rcyh1cGxvYWRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgX2xpbmtzLnZhbHVlID0gYXdhaXQgYXBpLmNhbGwoYHNoYXJpbmcvJHt1cGxvYWRJZH0vbGlua3M/dHlwZT1maWxlYCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBzaGFyZUl0ZW1zKFxuICAgIGl0ZW1zQXJyYXk6IEl0ZW1bXSxcbiAgICBwYXNzd29yZDogc3RyaW5nLFxuICAgIGV4cGlyYXRpb24/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgbGV0IHNob3VsZEFkZFBhc3N3b3JkQXNIYXNoID0gZmFsc2U7XG5cbiAgICBpZiAocGFzc3dvcmQubGVuZ3RoID09PSAwKSB7XG4gICAgICBwYXNzd29yZCA9IFV0aWwuZ2VuZXJhdGVSYW5kb21QYXNzd29yZCgpO1xuICAgICAgc2hvdWxkQWRkUGFzc3dvcmRBc0hhc2ggPSB0cnVlO1xuICAgIH1cblxuICAgIGxldCB1cmwgPSBhd2FpdCBzaGFyZXIuc2hhcmVJdGVtc1dpdGhQYXNzd29yZChcbiAgICAgIGl0ZW1zQXJyYXksXG4gICAgICBwYXNzd29yZCxcbiAgICAgIGV4cGlyYXRpb25cbiAgICApO1xuXG4gICAgaWYgKCF1cmwpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChzaG91bGRBZGRQYXNzd29yZEFzSGFzaCkge1xuICAgICAgdXJsID0gYCR7dXJsfSMke3Bhc3N3b3JkfWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHVybDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGdldFNoYXJlZEZvbGRlcihoYXNoOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYXdhaXQgYXBpLmNhbGw8Rm9sZGVyUmVzcG9uc2U+KGBzaGFyaW5nLyR7aGFzaH0vYCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBnZXRJbnZpdGF0aW9ucyh1c2VySWQ6IG51bWJlcikge1xuICAgIC8vIFRPRE86IHNoaWZ0IHRoZSB1c2VySWQgZnJvbSBmcm9udGVuZCBhcmd1bWVudCB0byBiYWNrZW5kIHNlc3Npb25cbiAgICByZXR1cm4gYXdhaXQgYXBpLmNhbGwoYHVzZXJzLyR7dXNlcklkfS9pbnZpdGF0aW9ucy9gKTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGdldEZvbGRlcnNTaGFyZWRXaXRoVXNlcih1c2VySWQ6IHN0cmluZykge1xuICAgIC8vIFRPRE86IHNoaWZ0IHRoZSB1c2VySWQgZnJvbSBmcm9udGVuZCBhcmd1bWVudCB0byBiYWNrZW5kIHNlc3Npb25cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIHJldHVybiBhd2FpdCBhcGkuY2FsbDx7IFtrZXk6IHN0cmluZ106IGFueSB9W10+KFxuICAgICAgYHVzZXJzLyR7dXNlcklkfS9mb2xkZXJzL3NoYXJlZFdpdGhVc2VyYFxuICAgICk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBnZXRGb2xkZXJzU2hhcmVkQnlVc2VyKHVzZXJJZDogc3RyaW5nKSB7XG4gICAgLy8gVE9ETzogc2hpZnQgdGhlIHVzZXJJZCBmcm9tIGZyb250ZW5kIGFyZ3VtZW50IHRvIGJhY2tlbmQgc2Vzc2lvblxuICAgIHJldHVybiBhd2FpdCBhcGkuY2FsbChgdXNlcnMvJHt1c2VySWR9L2ZvbGRlcnMvc2hhcmVkQnlVc2VyYCk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBnZXRTaGFyZXNGb3JGb2xkZXIoY29udGFpbmVySWQ6IG51bWJlciwgdXNlcklkOiBudW1iZXIpIHtcbiAgICAvLyBUT0RPOiBzaGlmdCB0aGUgdXNlcklkIGZyb20gZnJvbnRlbmQgYXJndW1lbnQgdG8gYmFja2VuZCBzZXNzaW9uXG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsKGBjb250YWluZXJzLyR7Y29udGFpbmVySWR9L3NoYXJlc2AsIHtcbiAgICAgIHVzZXJJZCxcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGFjY2VwdEludml0YXRpb24oaW52aXRhdGlvbklkOiBudW1iZXIsIGNvbnRhaW5lcklkOiBudW1iZXIpIHtcbiAgICByZXR1cm4gYXdhaXQgYXBpLmNhbGwoXG4gICAgICBgY29udGFpbmVycy8ke2NvbnRhaW5lcklkfS9tZW1iZXIvYWNjZXB0LyR7aW52aXRhdGlvbklkfWAsXG4gICAgICB7fSxcbiAgICAgICdQT1NUJ1xuICAgICk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiB1cGRhdGVJbnZpdGF0aW9uUGVybWlzc2lvbnMoXG4gICAgY29udGFpbmVySWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBpbnZpdGF0aW9uSWQ6IG51bWJlcixcbiAgICBwZXJtaXNzaW9uOiBudW1iZXJcbiAgKSB7XG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsKFxuICAgICAgYGNvbnRhaW5lcnMvJHtjb250YWluZXJJZH0vc2hhcmVzL2ludml0YXRpb24vdXBkYXRlYCxcbiAgICAgIHsgdXNlcklkLCBpbnZpdGF0aW9uSWQsIHBlcm1pc3Npb24gfSxcbiAgICAgICdQT1NUJ1xuICAgICk7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiB1cGRhdGVBY2Nlc3NMaW5rUGVybWlzc2lvbnMoXG4gICAgY29udGFpbmVySWQ6IG51bWJlcixcbiAgICB1c2VySWQ6IG51bWJlcixcbiAgICBhY2Nlc3NMaW5rSWQ6IHN0cmluZyxcbiAgICBwZXJtaXNzaW9uOiBudW1iZXJcbiAgKSB7XG4gICAgcmV0dXJuIGF3YWl0IGFwaS5jYWxsKFxuICAgICAgYGNvbnRhaW5lcnMvJHtjb250YWluZXJJZH0vc2hhcmVzL2FjY2Vzc0xpbmsvdXBkYXRlYCxcbiAgICAgIHsgdXNlcklkLCBhY2Nlc3NMaW5rSWQsIHBlcm1pc3Npb24gfSxcbiAgICAgICdQT1NUJ1xuICAgICk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIC8vIEdldHRlcnMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgIGxpbmtzLFxuXG4gICAgLy8gQWN0aW9ucyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gICAgY3JlYXRlQWNjZXNzTGluayxcbiAgICBpc0FjY2Vzc0xpbmtWYWxpZCxcbiAgICBhY2NlcHRBY2Nlc3NMaW5rLFxuICAgIGZldGNoRm9sZGVyQWNjZXNzTGlua3MsXG4gICAgZmV0Y2hGaWxlQWNjZXNzTGlua3MsXG4gICAgc2hhcmVJdGVtcyxcbiAgICBnZXRTaGFyZWRGb2xkZXIsXG4gICAgZ2V0SW52aXRhdGlvbnMsXG4gICAgZ2V0Rm9sZGVyc1NoYXJlZFdpdGhVc2VyLFxuICAgIGdldEZvbGRlcnNTaGFyZWRCeVVzZXIsXG4gICAgZ2V0U2hhcmVzRm9yRm9sZGVyLFxuICAgIGFjY2VwdEludml0YXRpb24sXG4gICAgdXBkYXRlSW52aXRhdGlvblBlcm1pc3Npb25zLFxuICAgIHVwZGF0ZUFjY2Vzc0xpbmtQZXJtaXNzaW9ucyxcbiAgfTtcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCB1c2VTaGFyaW5nU3RvcmU7XG4iXSwibmFtZXMiOlsiZ2V0Q29udGFpbmVyS2V5RnJvbUNoYWxsZW5nZSIsImhhc2giLCJwYXNzd29yZCIsImFwaSIsImtleWNoYWluIiwicmVzcCIsImNoYWxsZW5nZUtleVN0ciIsImNoYWxsZW5nZVNhbHRTdHIiLCJjaGFsbGVuZ2VDaXBoZXJ0ZXh0IiwiY2hhbGxlbmdlU2FsdCIsIlV0aWwiLCJ1bndyYXBwZWRDaGFsbGVuZ2VLZXkiLCJjaGFsbGVuZ2VQbGFpbnRleHQiLCJjaGFsbGVuZ2VSZXNwIiwiY29udGFpbmVySWQiLCJ3cmFwcGVkS2V5U3RyIiwic2FsdFN0ciIsImUiLCJTaGFyZXIiLCJ1c2VyIiwiaXRlbSIsImlkcyIsInUiLCJfaXRlbXMiLCJpdGVtcyIsImV4cGlyYXRpb24iLCJfX2l0ZW1zIiwiZW1haWwiLCJwdWJsaWNLZXkiLCJyZWNpcGllbnRJZCIsImltcG9ydGVkUHVibGljS2V5Iiwia2V5Iiwid3JhcHBlZEtleSIsIl9hIiwiX2IiLCJpdGVtc1RvU2hhcmUiLCJjdXJyZW50Q29udGFpbmVyIiwicmVzcG9uc2UiLCJDT05UQUlORVJfVFlQRSIsIl9jIiwibmV3Q29udGFpbmVySWQiLCJmaWxlbmFtZSIsImN1cnJlbnRXcmFwcGluZ0tleSIsInVwbG9hZElkIiwidHlwZSIsImNvbnRlbnRLZXkiLCJuZXdXcmFwcGluZ0tleSIsImNhbkNyZWF0ZUxpbmsiLCJ1bndyYXBwZWRLZXkiLCJzYWx0IiwicGFzc3dvcmRXcmFwcGVkS2V5U3RyIiwiY2hhbGxlbmdlS2V5IiwicGFzc3dvcmRXcmFwcGVkQ2hhbGxlbmdlS2V5U3RyIiwidXNlU2hhcmluZ1N0b3JlIiwiZGVmaW5lU3RvcmUiLCJ1c2VBcGlTdG9yZSIsInVzZVVzZXJTdG9yZSIsInVzZUtleWNoYWluU3RvcmUiLCJzaGFyZXIiLCJfbGlua3MiLCJyZWYiLCJsaW5rcyIsImNvbXB1dGVkIiwiY3JlYXRlQWNjZXNzTGluayIsImZvbGRlcklkIiwic2hvdWxkQWRkUGFzc3dvcmRBc0hhc2giLCJ1cmwiLCJhY2NlcHRBY2Nlc3NMaW5rIiwibGlua0lkIiwiY29udGFpbmVyS2V5IiwidHJwYyIsImlzQWNjZXNzTGlua1ZhbGlkIiwiZmV0Y2hGb2xkZXJBY2Nlc3NMaW5rcyIsImZldGNoRmlsZUFjY2Vzc0xpbmtzIiwic2hhcmVJdGVtcyIsIml0ZW1zQXJyYXkiLCJnZXRTaGFyZWRGb2xkZXIiLCJnZXRJbnZpdGF0aW9ucyIsInVzZXJJZCIsImdldEZvbGRlcnNTaGFyZWRXaXRoVXNlciIsImdldEZvbGRlcnNTaGFyZWRCeVVzZXIiLCJnZXRTaGFyZXNGb3JGb2xkZXIiLCJhY2NlcHRJbnZpdGF0aW9uIiwiaW52aXRhdGlvbklkIiwidXBkYXRlSW52aXRhdGlvblBlcm1pc3Npb25zIiwicGVybWlzc2lvbiIsInVwZGF0ZUFjY2Vzc0xpbmtQZXJtaXNzaW9ucyIsImFjY2Vzc0xpbmtJZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQSxlQUFzQkEsRUFDcEJDLEdBQ0FDLEdBQ0FDLEdBQ0FDLEdBSVE7QUFDUixRQUFNQyxJQUFPLE1BQU1GLEVBQUksS0FJcEIsV0FBV0YsQ0FBSSxZQUFZO0FBRTlCLE1BQUksQ0FBQ0k7QUFDSCxXQUFPO0FBS1QsUUFBTTtBQUFBLElBQ0osY0FBY0M7QUFBQSxJQUNkLGVBQWVDO0FBQUEsSUFDZixxQkFBQUM7QUFBQSxFQUFBLElBQ0VIO0FBS0osTUFBSUk7QUFDSixNQUFJO0FBQ0YsSUFBQUEsSUFBZ0JDLEVBQUssb0JBQW9CSCxDQUFnQjtBQUFBLEVBRTNELFFBQVk7QUFDVixXQUFPO0FBQUEsRUFDVDtBQUVBLE1BQUk7QUFFRixVQUFNSSxJQUNKLE1BQU1QLEVBQVMsU0FBUztBQUFBLE1BQ3RCRTtBQUFBLE1BQ0FKO0FBQUEsTUFDQU87QUFBQSxJQUFBLEdBSUVHLElBQ0osTUFBTVIsRUFBUyxVQUFVO0FBQUEsTUFDdkJJO0FBQUEsTUFDQUc7QUFBQSxNQUNBRjtB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
