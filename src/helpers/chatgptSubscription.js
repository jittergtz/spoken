const { app, safeStorage, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const file = () => path.join(app.getPath("userData"), "chatgpt-subscription.bin");
let refreshPromise;
let signInPromise;

function load() {
  if (!fs.existsSync(file())) return null;
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text")
  )
    throw new Error("Secure credential storage is unavailable.");
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(file())));
}
function save(data) {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text")
  )
    throw new Error("Secure credential storage is unavailable.");
  const temporary = `${file()}.tmp`;
  fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(data)), { mode: 0o600 });
  fs.renameSync(temporary, file());
}
async function form(url, values) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error_description || data.error || `Request failed (${response.status})`);
  return data;
}
async function identity(token, clientId, nonce) {
  const [headerPart, payloadPart, signature] = token.split(".");
  if (!headerPart || !payloadPart || !signature) throw new Error("Invalid identity token.");
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString());
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString());
  if (header.alg !== "RS256") throw new Error("Unsupported identity token algorithm.");
  const discovery = await fetch(`${issuer}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(30000),
  }).then((r) => r.json());
  if (discovery.issuer !== issuer || new URL(discovery.jwks_uri).origin !== issuer)
    throw new Error("Invalid identity provider configuration.");
  const keys = await fetch(discovery.jwks_uri, { signal: AbortSignal.timeout(30000) }).then((r) =>
    r.json()
  );
  const key = keys.keys.find((item) => item.kid === header.kid && item.kty === "RSA");
  if (
    !key ||
    !crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      crypto.createPublicKey({ key, format: "jwk" }),
      Buffer.from(signature, "base64url")
    )
  )
    throw new Error("Identity token signature verification failed.");
  if (
    claims.iss !== issuer ||
    !(Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId) ||
    typeof claims.exp !== "number" ||
    claims.exp <= Date.now() / 1000 ||
    claims.nonce !== nonce ||
    typeof claims.sub !== "string" ||
    !claims.sub
  )
    throw new Error("Identity token validation failed.");
  return claims;
}
async function signIn() {
  if (signInPromise) return signInPromise;
  signInPromise = (async () => {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text")
    )
      throw new Error("Secure credential storage is unavailable.");
    const previous = load();
    const hostId = previous?.hostId || `urn:uuid:${crypto.randomUUID()}`;
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const server = http.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
    const params = new URLSearchParams({
      client_id: previous?.clientId || "dynamic_agent_client",
      ext_agent_host_id: hostId,
      response_type: "code",
      redirect_uri: redirect,
      scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      resource,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });
    if (!previous?.clientId) params.set("agent_name_hint", "Spoken");
    try {
      const callback = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Sign-in timed out.")), 180000);
        server.on("request", (req, res) => {
          const url = new URL(req.url, redirect);
          if (url.pathname !== "/auth/callback") {
            res.writeHead(404).end();
            return;
          }
          if (url.searchParams.get("state") !== state) {
            res.writeHead(400).end("Invalid sign-in state.");
            return;
          }
          clearTimeout(timer);
          res.writeHead(200, { "content-type": "text/plain" }).end("You can return to Spoken.");
          resolve(url.searchParams);
        });
      });
      await shell.openExternal(`${issuer}/api/accounts/authorize?${params}`);
      const result = await callback;
      if (result.get("error")) throw new Error(`Sign-in failed: ${result.get("error")}`);
      const clientId = result.get("client_id") || previous?.clientId;
      if (
        !clientId ||
        !result.get("code") ||
        (previous?.clientId && clientId !== previous.clientId)
      )
        throw new Error("Invalid sign-in response.");
      const tokens = await form(`${issuer}/api/accounts/oauth/token`, {
        grant_type: "authorization_code",
        client_id: clientId,
        code: result.get("code"),
        code_verifier: verifier,
        redirect_uri: redirect,
        resource,
      });
      const claims = await identity(tokens.id_token, clientId, nonce);
      if (previous?.subject && previous.subject !== claims.sub)
        throw new Error("The selected account does not match the previous account.");
      if (!tokens.scope?.split(" ").includes("chatgpt.tokens.use.direct"))
        throw new Error("ChatGPT plan usage permission was not granted.");
      save({
        hostId,
        clientId,
        subject: claims.sub,
        email: claims.email,
        tokens,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
      return { connected: true, email: claims.email || "" };
    } finally {
      server.close();
    }
  })().finally(() => {
    signInPromise = undefined;
  });
  return signInPromise;
}
async function access() {
  const session = load();
  if (!session?.tokens?.access_token) throw new Error("Connect your ChatGPT account first.");
  if (session.expiresAt > Date.now() + 60000) return session.tokens.access_token;
  if (!refreshPromise)
    refreshPromise = (async () => {
      const tokens = await form(`${issuer}/api/accounts/oauth/token`, {
        grant_type: "refresh_token",
        client_id: session.clientId,
        refresh_token: session.tokens.refresh_token,
        resource,
      });
      const updated = {
        ...session,
        tokens: { ...session.tokens, ...tokens },
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };
      save(updated);
      return updated.tokens.access_token;
    })().finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
}
async function models() {
  const token = await access();
  const response = await fetch(`${resource}/models`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Unable to list ChatGPT models (${response.status}).`);
  const data = await response.json();
  return (data.models || [])
    .filter((item) => item.visibility === "list")
    .map((item) => ({ value: item.slug, label: item.display_name }));
}
async function generate({ text, model, instructions }) {
  const token = await access();
  const response = await fetch(`${resource}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content: text }],
      store: false,
      stream: true,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error?.message || data.detail || `ChatGPT request failed (${response.status}).`
    );
  }
  let buffer = "",
    output = "",
    completed = false;
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop();
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      const item = JSON.parse(data);
      if (item.type === "response.output_text.delta") output += item.delta;
      if (item.type === "response.completed") completed = true;
      if (
        item.type === "response.failed" ||
        item.type === "response.incomplete" ||
        item.type === "error"
      )
        throw new Error(
          item.response?.error?.message || item.message || "ChatGPT could not complete the request."
        );
    }
  }
  if (!completed || !output.trim()) throw new Error("ChatGPT returned an incomplete response.");
  return output;
}
async function disconnect() {
  if (signInPromise) throw new Error("Wait for sign-in to finish before disconnecting.");
  if (refreshPromise) await refreshPromise;
  const session = load();
  if (!session) return { success: true };
  let revoked = false;
  try {
    const discovery = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json());
    if (new URL(discovery.revocation_endpoint).origin !== issuer)
      throw new Error("Invalid revocation endpoint.");
    const response = await fetch(discovery.revocation_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: session.tokens.refresh_token,
        token_type_hint: "refresh_token",
        client_id: session.clientId,
      }),
      signal: AbortSignal.timeout(10000),
    });
    revoked = response.ok;
  } catch {}
  save({
    hostId: session.hostId,
    clientId: session.clientId,
    subject: session.subject,
    email: session.email,
  });
  return { success: true, revoked };
}
module.exports = {
  signIn,
  models,
  generate,
  disconnect,
  status: () => {
    const session = load();
    return { connected: !!session?.tokens?.access_token, email: session?.email || "" };
  },
};
