const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(req, allowedOrigins) {
  const requestOrigin = req.headers.origin;
  if (!allowedOrigins.length || allowedOrigins.includes("*")) {
    return requestOrigin || "*";
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0];
}

function applyCors(res, origin, methods, headers) {
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "false");
  res.setHeader("Access-Control-Allow-Methods", methods.join(","));
  res.setHeader("Access-Control-Allow-Headers", headers);
  res.setHeader("Vary", "Origin");
}

function buildForwardUrl(targetBase, requestUrl, host) {
  const forwardUrl = new URL(targetBase);
  const incomingUrl = new URL(requestUrl, `http://${host || "localhost"}`);
  incomingUrl.searchParams.forEach((value, key) => {
    forwardUrl.searchParams.append(key, value);
  });
  return forwardUrl.toString();
}

function prepareForwardHeaders(incomingHeaders) {
  const headers = {};
  Object.keys(incomingHeaders || {}).forEach(key => {
    if (!key) return;
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }
    headers[key] = incomingHeaders[key];
  });
  return headers;
}

function appendForwardedFor(headers, req) {
  const chain = [];
  if (headers["x-forwarded-for"]) {
    chain.push(headers["x-forwarded-for"]);
  }
  const remote = req.headers["x-real-ip"] || req.socket?.remoteAddress;
  if (remote) {
    chain.push(remote);
  }
  if (chain.length) {
    headers["x-forwarded-for"] = chain.join(", ");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createProxy(options) {
  const { targetEnv, allowedMethods = ["GET", "POST", "OPTIONS"] } = options || {};
  if (!targetEnv) {
    throw new Error("createProxy requires a targetEnv option.");
  }

  return async function handler(req, res) {
    const methods = allowedMethods;
    const allowedOrigins = parseCsv(process.env.PROXY_ALLOWED_ORIGINS || "*");
    const allowedHeaders = process.env.PROXY_ALLOWED_HEADERS || "Content-Type,Authorization,X-Requested-With";
    const origin = resolveAllowedOrigin(req, allowedOrigins);

    applyCors(res, origin, methods, allowedHeaders);

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }

    if (!methods.includes(req.method)) {
      res.status(405).json({ success: false, error: "Method not allowed." });
      return;
    }

    const targetBase = process.env[targetEnv];
    if (!targetBase) {
      res.status(500).json({ success: false, error: `Missing ${targetEnv} environment variable.` });
      return;
    }

    const forwardUrl = buildForwardUrl(targetBase, req.url || "/", req.headers.host);
    const forwardHeaders = prepareForwardHeaders(req.headers);
    appendForwardedFor(forwardHeaders, req);

    let bodyBuffer;
    if (req.method !== "GET" && req.method !== "HEAD") {
      bodyBuffer = await readBody(req);
    }

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(forwardUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: bodyBuffer && bodyBuffer.length ? bodyBuffer : undefined,
        redirect: "manual"
      });
    } catch (err) {
      console.error("Proxy request failed:", err);
      res.status(502).json({ success: false, error: "Upstream request failed." });
      return;
    }

    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    applyCors(res, origin, methods, allowedHeaders);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const arrayBuffer = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  };
}

module.exports = { createProxy };
