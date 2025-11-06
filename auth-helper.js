(function () {
  const CLIENT_ID = window.MENTOR_TRACKER_CLIENT_ID || "470142220043-4pm52ffc5gapjdgtplf6uim5t5o1juj7.apps.googleusercontent.com";
  const AUTH_EVENT = "mentortracker-auth-state";

  let idToken = null;
  let payload = null;
  let initialized = false;
  const queuedResolvers = [];

  function getAuthOptions() {
    return Object.assign({
      allowedDomain: "",
      allowedEmails: [],
      autoSelect: true,
      prompt: true,
      buttonConfig: { theme: "outline", size: "medium", type: "standard" }
    }, window.MENTOR_TRACKER_AUTH_OPTIONS || {});
  }

  function waitForGoogleLibrary() {
    return new Promise((resolve, reject) => {
      const maxWaitMs = 10000;
      let elapsed = 0;
      (function poll() {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          resolve(window.google.accounts.id);
          return;
        }
        elapsed += 50;
        if (elapsed >= maxWaitMs) {
          reject(new Error("Google Identity Services library failed to load."));
          return;
        }
        setTimeout(poll, 50);
      })();
    });
  }

  function decodePayload(token) {
    if (!token) return null;
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch (err) {
      console.warn("Unable to decode ID token payload", err);
      return null;
    }
  }

  function broadcastAuthChange() {
    document.dispatchEvent(new CustomEvent(AUTH_EVENT, {
      detail: {
        signedIn: Boolean(idToken),
        token: idToken,
        payload: payload
      }
    }));
  }

  function ensureFloatingPanel() {
    let panel = document.getElementById("mentortracker-auth-floating");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "mentortracker-auth-floating";
    panel.innerHTML = `
      <style>
        #mentortracker-auth-floating {
          position: fixed;
          top: 12px;
          right: 12px;
          z-index: 99999;
          font-family: 'Inter', Arial, sans-serif;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
          pointer-events: none;
        }
        #mentortracker-auth-floating .auth-status-box,
        #mentortracker-auth-floating [data-role="auth-button"] {
          pointer-events: auto;
        }
        #mentortracker-auth-floating .auth-status-box {
          background: rgba(42, 52, 141, 0.92);
          color: #fff;
          padding: 8px 12px;
          border-radius: 10px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.15);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        #mentortracker-auth-floating .auth-status-box button {
          background: rgba(255,255,255,0.25);
          border: none;
          color: #fff;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        #mentortracker-auth-floating .auth-status-box button:hover {
          background: rgba(255,255,255,0.35);
        }
        .auth-gated {
          opacity: 0.45;
          pointer-events: none;
        }
      </style>
      <div data-role="auth-button"></div>
      <div class="auth-status-box" data-role="auth-status" style="display:none;">
        <span data-role="auth-email"></span>
        <button type="button" data-role="auth-signout">Sign out</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector("[data-role='auth-signout']").addEventListener("click", signOut);
    return panel;
  }

  function updateUi() {
    const panel = ensureFloatingPanel();
    const buttonSlot = panel.querySelector("[data-role='auth-button']");
    const statusBox = panel.querySelector("[data-role='auth-status']");
    const emailSpan = panel.querySelector("[data-role='auth-email']");

    if (idToken) {
      buttonSlot.style.display = "none";
      statusBox.style.display = "flex";
      emailSpan.textContent = payload?.email || "Signed in";
    } else {
      statusBox.style.display = "none";
      buttonSlot.style.display = "block";
      emailSpan.textContent = "";
    }

    document.querySelectorAll("[data-auth-required]").forEach(el => {
      const controls = el.matches("input, select, textarea, button, form, fieldset")
        ? [el]
        : Array.from(el.querySelectorAll("input, select, textarea, button"));

      if (idToken) {
        el.classList.remove("auth-gated");
        controls.forEach(ctrl => {
          if (ctrl.dataset.authOriginallyDisabled === "true") return;
          ctrl.removeAttribute("disabled");
        });
      } else {
        el.classList.add("auth-gated");
        controls.forEach(ctrl => {
          if (!ctrl.hasAttribute("disabled") && !ctrl.dataset.authOriginallyDisabled) {
            ctrl.dataset.authOriginallyDisabled = "false";
          } else if (ctrl.hasAttribute("disabled")) {
            ctrl.dataset.authOriginallyDisabled = "true";
          }
          ctrl.setAttribute("disabled", "disabled");
        });
      }
    });
  }

  function clearAuthState() {
    idToken = null;
    payload = null;
    updateUi();
    broadcastAuthChange();
  }

  function finishQueues(err) {
    while (queuedResolvers.length) {
      const { resolve, reject } = queuedResolvers.shift();
      if (err) reject(err);
      else resolve(idToken);
    }
  }

  function setAuthToken(token, constraints) {
    const decoded = decodePayload(token);
    if (!decoded) {
      console.warn("Received malformed ID token.");
      return;
    }

    const allowedDomain = (constraints.allowedDomain || "").toLowerCase();
    const allowedEmails = (constraints.allowedEmails || []).map(e => e.toLowerCase());
    const email = (decoded.email || "").toLowerCase();
    const domain = (decoded.hd || email.split("@")[1] || "").toLowerCase();

    if (allowedEmails.length > 0 && allowedEmails.indexOf(email) === -1) {
      if (!allowedDomain || domain !== allowedDomain) {
        alert("This account is not authorised for Mentor Tracker.");
        signOut();
        return;
      }
    }

    if (allowedDomain && domain !== allowedDomain && allowedEmails.indexOf(email) === -1) {
      alert("Please sign in with an account from " + allowedDomain);
      signOut();
      return;
    }

    console.info("[MentorTracker] Authenticated as", email);
    idToken = token;
    payload = decoded;
    updateUi();
    broadcastAuthChange();
    finishQueues();
  }

  async function initAuth(customOptions) {
    if (initialized) return;
    const options = Object.assign(getAuthOptions(), customOptions || {});

    if (!CLIENT_ID || CLIENT_ID === "REPLACE_WITH_GOOGLE_CLIENT_ID") {
      console.warn("Mentor Tracker: set window.MENTOR_TRACKER_CLIENT_ID before loading auth-helper.js");
      return;
    }

    try {
      const googleId = await waitForGoogleLibrary();
      const panel = ensureFloatingPanel();
      const buttonSlot = panel.querySelector("[data-role='auth-button']");

      googleId.initialize({
        client_id: CLIENT_ID,
        callback: response => setAuthToken(response.credential, options),
        auto_select: options.autoSelect !== false
      });

      googleId.renderButton(buttonSlot, options.buttonConfig || {});
      if (options.prompt !== false) {
        googleId.prompt();
      }

      initialized = true;
    } catch (err) {
      console.error("Mentor Tracker auth setup failed:", err);
      finishQueues(err);
    }
  }

  function signOut() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    clearAuthState();
    finishQueues(new Error("Signed out"));
  }

  function requireToken() {
    if (idToken) return Promise.resolve(idToken);
    return new Promise((resolve, reject) => {
      queuedResolvers.push({ resolve, reject });
      ensureFloatingPanel();
      alert("Please sign in with Google to continue.");
    });
  }

  function appendTokenToUrl(originalUrl, token) {
    try {
      const url = new URL(originalUrl, window.location.origin);
      url.searchParams.set("idToken", token);
      return url.toString();
    } catch (err) {
      console.warn("Mentor Tracker could not append idToken to URL:", err);
      return originalUrl;
    }
  }

  function appendTokenToBody(body, token, headers) {
    if (body == null) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      return new URLSearchParams({ idToken: token }).toString();
    }

    if (body instanceof FormData) {
      if (!body.has("idToken")) body.append("idToken", token);
      return body;
    }

    if (body instanceof URLSearchParams) {
      body.set("idToken", token);
      return body.toString();
    }

    const headerValue = headers.get("Content-Type") || "";
    if (typeof body === "string") {
      if (headerValue.includes("application/json")) {
        try {
          const parsed = JSON.parse(body || "{}");
          parsed.idToken = token;
          return JSON.stringify(parsed);
        } catch (err) {
          console.warn("Mentor Tracker could not inject idToken into JSON body:", err);
          return body;
        }
      }

      if (headerValue.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(body);
        params.set("idToken", token);
        return params.toString();
      }

      return body;
    }

    if (typeof body === "object") {
      const merged = Object.assign({}, body, { idToken: token });
      headers.set("Content-Type", "application/json");
      return JSON.stringify(merged);
    }

    return body;
  }

  async function authorizedFetch(url, options) {
    const token = await requireToken();
    const requestOptions = Object.assign({}, options);
    const headers = new Headers(requestOptions.headers || {});
    const method = (requestOptions.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") {
      url = appendTokenToUrl(url, token);
    } else {
      requestOptions.body = appendTokenToBody(requestOptions.body, token, headers);
    }

    return fetch(url, requestOptions);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureFloatingPanel();
    updateUi();
    initAuth();
  });

  window.MENTOR_TRACKER_AUTH = {
    init: initAuth,
    requireToken,
    getToken: () => idToken,
    getPayload: () => payload,
    signOut
  };

  window.MENTOR_TRACKER_secureFetch = authorizedFetch;
})();
