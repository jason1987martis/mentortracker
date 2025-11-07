// Shared helper to resolve Google Apps Script endpoints from query params or storage.
(function () {
  const globalDefaultApi = typeof window !== "undefined" ? window.MENTOR_TRACKER_DEFAULT_API_URL : undefined;
  const globalDefaultUpload = typeof window !== "undefined" ? window.MENTOR_TRACKER_DEFAULT_UPLOAD_URL : undefined;
  const DEFAULT_API_URL = globalDefaultApi || "https://script.google.com/macros/s/AKfycbzRMrKi2BFLuEhIs4NJx3XwDgKwNomCPpWlxH9C64tDcAMskkziUcSHXgWSL3ZgNUvE/exec";
  const DEFAULT_UPLOAD_URL = globalDefaultUpload || "https://script.google.com/macros/s/AKfycbzpzN_V5rPDiUyuU8x2aWXjg1UZZZsCcubCqjJrg14johENQOBI2pUGkkO1LZ0nDSXgnw/exec";

  const params = new URLSearchParams(window.location.search);
  const paramApi = params.get("apiUrl");
  const paramUpload = params.get("uploadUrl");

  if (paramApi) {
    try {
      localStorage.setItem("mentorTrackerApiUrl", paramApi);
    } catch (err) {
      console.warn("Unable to store apiUrl in localStorage:", err);
    }
  }

  if (paramUpload) {
    try {
      localStorage.setItem("mentorTrackerUploadUrl", paramUpload);
    } catch (err) {
      console.warn("Unable to store uploadUrl in localStorage:", err);
    }
  }

  let storedApi = null;
  let storedUpload = null;

  try {
    storedApi = localStorage.getItem("mentorTrackerApiUrl");
    storedUpload = localStorage.getItem("mentorTrackerUploadUrl");
  } catch (err) {
    console.warn("Unable to read configuration from localStorage:", err);
  }

  const apiUrl = paramApi || storedApi || DEFAULT_API_URL;
  const uploadUrl = paramUpload || storedUpload || paramApi || storedApi || DEFAULT_UPLOAD_URL;

  const activeParams = new URLSearchParams();
  if (paramApi || storedApi) {
    activeParams.set("apiUrl", apiUrl);
  }
  if (paramUpload || storedUpload) {
    if (uploadUrl !== apiUrl || paramUpload) {
      activeParams.set("uploadUrl", uploadUrl);
    }
  }

  function buildUrl(path) {
    if (!path) return path;
    const query = activeParams.toString();
    const [base, hash = ""] = path.split("#");
    const cleanBase = base.split("?")[0];
    if (!query) {
      return `${cleanBase}${hash ? "#" + hash : ""}`;
    }
    return `${cleanBase}?${query}${hash ? "#" + hash : ""}`;
  }

  function appendQueryToAnchors(root) {
    const query = activeParams.toString();
    if (!query) return;
    const scope = root || document;
    scope.querySelectorAll("a[data-keep-query]").forEach(anchor => {
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      anchor.setAttribute("href", buildUrl(href));
    });
  }

  window.MENTOR_TRACKER_CONFIG = {
    apiUrl,
    uploadUrl,
    buildUrl,
    appendQueryToAnchors
  };

  document.addEventListener("DOMContentLoaded", () => {
    appendQueryToAnchors(document);
  });
})();
