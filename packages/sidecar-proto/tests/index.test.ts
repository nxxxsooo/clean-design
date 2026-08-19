import { describe, expect, it } from "vitest";

import {
  APP_KEYS,
  CLEAN_DESIGN_SERVICE_LIMITS,
  CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION,
  normalizeDaemonSidecarMessage,
  normalizeDesktopSidecarMessage,
  normalizeNamespace,
  normalizeSidecarStamp,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_MESSAGES,
  SIDECAR_SOURCES,
  SIDECAR_STAMP_FIELDS,
  STAMP_APP_FLAG,
  STAMP_IPC_FLAG,
  STAMP_MODE_FLAG,
  STAMP_NAMESPACE_FLAG,
  STAMP_SOURCE_FLAG,
  type DaemonStatusSnapshot,
} from "../src/index.js";

const validStamp = {
  app: APP_KEYS.WEB,
  ipc: "/tmp/clean-design/ipc/contract-check/web.sock",
  mode: "dev" as const,
  namespace: "contract-check",
  source: SIDECAR_SOURCES.TOOLS_DEV,
};

describe("open-design sidecar contract", () => {
  it("exports the canonical five-field stamp descriptor", () => {
    expect(SIDECAR_STAMP_FIELDS).toEqual(["app", "mode", "namespace", "ipc", "source"]);
    expect(OPEN_DESIGN_SIDECAR_CONTRACT.stampFlags).toEqual({
      app: STAMP_APP_FLAG,
      ipc: STAMP_IPC_FLAG,
      mode: STAMP_MODE_FLAG,
      namespace: STAMP_NAMESPACE_FLAG,
      source: STAMP_SOURCE_FLAG,
    });
  });

  it("isolates Clean Design IPC endpoints from the upstream product", () => {
    expect(SIDECAR_DEFAULTS.ipcBase).toBe("/tmp/clean-design/ipc");
    expect(SIDECAR_DEFAULTS.windowsPipePrefix).toBe("clean-design");
  });

  it("accepts the explicit namespace contract", () => {
    expect(normalizeNamespace("contract-check_1.alpha")).toBe("contract-check_1.alpha");
  });

  it("rejects path-like or whitespace namespaces", () => {
    expect(() => normalizeNamespace("../other")).toThrow();
    expect(() => normalizeNamespace(" contract-check")).toThrow();
    expect(() => normalizeNamespace("contract check")).toThrow();
  });

  it("accepts exactly app, mode, namespace, ipc, and source", () => {
    expect(normalizeSidecarStamp(validStamp)).toEqual(validStamp);
  });

  it("rejects legacy or extra stamp fields", () => {
    expect(() => normalizeSidecarStamp({ ...validStamp, runtimeToken: "legacy" })).toThrow();
    expect(() => normalizeSidecarStamp({ ...validStamp, role: "web-sidecar" })).toThrow();
  });

  it("rejects non-contract sidecar sources", () => {
    expect(() => normalizeSidecarStamp({ ...validStamp, source: "custom-script" })).toThrow();
  });

  it("validates daemon IPC messages", () => {
    expect(normalizeDaemonSidecarMessage({ type: SIDECAR_MESSAGES.STATUS })).toEqual({ type: "status" });
    expect(normalizeDaemonSidecarMessage({ type: SIDECAR_MESSAGES.SHUTDOWN })).toEqual({ type: "shutdown" });
    expect(() => normalizeDaemonSidecarMessage({ input: {}, type: SIDECAR_MESSAGES.EVAL })).toThrow();
  });

  it("accepts a base64 register-desktop-auth payload", () => {
    const message = {
      input: { secret: "AAECAwQFBgcICQoLDA0ODw==" },
      type: SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
    };
    expect(normalizeDaemonSidecarMessage(message)).toEqual(message);
  });

  it("accepts a mint-import-token payload with a baseDir", () => {
    const message = {
      input: { baseDir: "/Users/u/project" },
      type: SIDECAR_MESSAGES.MINT_IMPORT_TOKEN,
    };
    expect(normalizeDaemonSidecarMessage(message)).toEqual(message);
  });

  it("accepts a signed credential synchronization payload", () => {
    const message = {
      input: {
        credentials: [{ ref: "credential://abcdefghijklmnop", mask: "****1234", secret: "secret-1234" }],
        issuedAt: "2026-08-09T00:00:00.000Z",
        nonce: "abcdefghijklmnopqrstuvwxyzABCDEFGH",
        signature: "abcdefghijklmnopqrstuvwxyzABCDEFGHijklmnop",
      },
      type: SIDECAR_MESSAGES.SYNC_CREDENTIALS,
    };
    expect(normalizeDaemonSidecarMessage(message)).toEqual(message);
  });

  it('accepts a signed trusted handoff root payload', () => {
    const message = {
      input: {
        projectId: 'project-1',
        root: '/Users/u/Documents/handoffs',
        issuedAt: '2026-08-09T00:00:00.000Z',
        nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGH',
        signature: 'abcdefghijklmnopqrstuvwxyzABCDEFGHijklmnop',
      },
      type: SIDECAR_MESSAGES.SET_HANDOFF_ROOT,
    };
    expect(normalizeDaemonSidecarMessage(message)).toEqual(message);
  });

  it("rejects malformed mint-import-token payloads", () => {
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { baseDir: "" },
        type: SIDECAR_MESSAGES.MINT_IMPORT_TOKEN,
      }),
    ).toThrow(/baseDir/i);
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { baseDir: "/Users/u/project", extra: true },
        type: SIDECAR_MESSAGES.MINT_IMPORT_TOKEN,
      }),
    ).toThrow(/extra/i);
  });

  it("rejects register-desktop-auth payloads that are not base64-shaped", () => {
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { secret: "not base64!" },
        type: SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
      }),
    ).toThrow(/base64/i);
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { secret: "" },
        type: SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
      }),
    ).toThrow();
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: {},
        type: SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
      }),
    ).toThrow();
  });

  it("validates desktop IPC message inputs", () => {
    expect(normalizeDesktopSidecarMessage({ type: SIDECAR_MESSAGES.SHOW })).toEqual({ type: "show" });
    expect(normalizeDesktopSidecarMessage({ input: { expression: "location.href" }, type: SIDECAR_MESSAGES.EVAL })).toEqual({
      input: { expression: "location.href" },
      type: "eval",
    });
    expect(() => normalizeDesktopSidecarMessage({ input: { expression: 42 }, type: SIDECAR_MESSAGES.EVAL })).toThrow();
    expect(() => normalizeDesktopSidecarMessage({ input: { selector: "" }, type: SIDECAR_MESSAGES.CLICK })).toThrow();
  });

  it("requires DaemonStatusSnapshot to carry desktopAuthGateActive (PR #974 round 6)", () => {
    // The TS compiler enforces that `desktopAuthGateActive: boolean` is
    // present on every constructed snapshot — tools-dev's split-start
    // hardening relies on the daemon STATUS IPC carrying this field so
    // `start desktop` can detect an ungated already-running daemon and
    // restart it before launching desktop main. Removing the field, or
    // softening it to optional, must fail this build.
    const armed: DaemonStatusSnapshot = {
      state: "running",
      url: "http://127.0.0.1:7456",
      desktopAuthGateActive: true,
    };
    const dormant: DaemonStatusSnapshot = {
      state: "running",
      url: "http://127.0.0.1:7456",
      desktopAuthGateActive: false,
    };
    expect(armed.desktopAuthGateActive).toBe(true);
    expect(dormant.desktopAuthGateActive).toBe(false);
  });

  it("validates desktop PDF export IPC message inputs", () => {
    expect(
      normalizeDesktopSidecarMessage({
        input: {
          baseHref: "http://127.0.0.1:7456/api/projects/proj/raw/deck/",
          deck: true,
          defaultFilename: "Seed Deck.pdf",
          html: "<!doctype html><section class=\"slide\">One</section>",
          title: "Seed Deck",
        },
        type: SIDECAR_MESSAGES.EXPORT_PDF,
      }),
    ).toEqual({
      input: {
        baseHref: "http://127.0.0.1:7456/api/projects/proj/raw/deck/",
        deck: true,
        defaultFilename: "Seed Deck.pdf",
        html: "<!doctype html><section class=\"slide\">One</section>",
        title: "Seed Deck",
      },
      type: "export-pdf",
    });
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { deck: true, defaultFilename: "x.pdf", html: "", title: "x" },
        type: SIDECAR_MESSAGES.EXPORT_PDF,
      }),
    ).toThrow();
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { deck: "yes", defaultFilename: "x.pdf", html: "<p>x</p>", title: "x" },
        type: SIDECAR_MESSAGES.EXPORT_PDF,
      }),
    ).toThrow();
  });

  it("validates desktop render-slides IPC message inputs", () => {
    expect(
      normalizeDesktopSidecarMessage({
        input: {
          baseHref: "http://127.0.0.1:7456/api/projects/proj/raw/deck/",
          deck: true,
          editable: true,
          html: "<!doctype html><section class=\"slide\">One</section>",
          outputDir: "/data/export-render/abc123",
          pageImageFormat: "jpeg",
          stitch: true,
          paginate: true,
          width: 1280,
          height: 720,
        },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toEqual({
      input: {
        baseHref: "http://127.0.0.1:7456/api/projects/proj/raw/deck/",
        deck: true,
        editable: true,
        html: "<!doctype html><section class=\"slide\">One</section>",
        outputDir: "/data/export-render/abc123",
        pageImageFormat: "jpeg",
        stitch: true,
        paginate: true,
        width: 1280,
        height: 720,
      },
      type: "render-slides",
    });
    // `deck: false` round-trips (explicit page mode) and a non-boolean is rejected.
    expect(
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", deck: false },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toEqual({ input: { html: "<p>x</p>", deck: false }, type: "render-slides" });
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", deck: "yes" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow();
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", editable: "yes" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow();
    // outputDir must be absolute — a relative path is rejected so a malformed
    // request can't make desktop write outside the daemon scratch dir.
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", outputDir: "export-render/abc" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow(/absolute path/);
    // index: a non-negative integer round-trips; negative / fractional / non-number reject.
    expect(
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", index: 1 },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toEqual({ input: { html: "<p>x</p>", index: 1 }, type: "render-slides" });
    for (const badIndex of [-1, 1.5, Number.NaN, "0"]) {
      expect(() =>
        normalizeDesktopSidecarMessage({
          input: { html: "<p>x</p>", index: badIndex },
          type: SIDECAR_MESSAGES.RENDER_SLIDES,
        }),
      ).toThrow();
    }
    // Minimal input (only html) round-trips with nothing extra.
    expect(
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toEqual({ input: { html: "<p>x</p>" }, type: "render-slides" });
    // Invalid: empty html, bad enum, non-boolean stitch, unknown key.
    expect(() =>
      normalizeDesktopSidecarMessage({ input: { html: "" }, type: SIDECAR_MESSAGES.RENDER_SLIDES }),
    ).toThrow();
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", pageImageFormat: "webp" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow();
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", stitch: "yes" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow();
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", paginate: "yes" },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow();
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { html: "<p>x</p>", bogus: 1 },
        type: SIDECAR_MESSAGES.RENDER_SLIDES,
      }),
    ).toThrow();
  });

  it("accepts PNG/JPEG artifact image export and rejects WebP up front", () => {
    // The off-screen Electron renderer (nativeImage) can only encode PNG/JPEG.
    for (const imageFormat of ["png", "jpeg"] as const) {
      expect(
        normalizeDesktopSidecarMessage({
          input: { deck: false, format: "image", html: "<p>x</p>", imageFormat, title: "Shot" },
          type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
        }),
      ).toEqual({
        input: { deck: false, format: "image", html: "<p>x</p>", imageFormat, title: "Shot" },
        type: "export-artifact",
      });
    }
    // WebP must fail fast with a clear error rather than silently downgrade to PNG.
    expect(() =>
      normalizeDesktopSidecarMessage({
        input: { deck: false, format: "image", html: "<p>x</p>", imageFormat: "webp", title: "Shot" },
        type: SIDECAR_MESSAGES.EXPORT_ARTIFACT,
      }),
    ).toThrow(/unsupported artifact export image format/);
  });

});

describe("local service protocol", () => {
  const clientNonce = "a".repeat(43);

  it("keeps the sidecar stamp at exactly five fields", () => {
    // Rich service state belongs in private runtime files, never in the stamp.
    expect(SIDECAR_STAMP_FIELDS).toEqual(["app", "mode", "namespace", "ipc", "source"]);
  });

  it("exposes the renderer app key for the bounded render broker", () => {
    expect(APP_KEYS.RENDERER).toBe("renderer");
  });

  it("pins the approved service limits", () => {
    expect(CLEAN_DESIGN_SERVICE_PROTOCOL_VERSION).toBe(1);
    expect(CLEAN_DESIGN_SERVICE_LIMITS).toEqual({
      clientCapacity: 16,
      idleExitMs: 60_000,
      leaseRenewMs: 20_000,
      leaseTtlMs: 45_000,
      operationConcurrency: 2,
      queueCapacity: 32,
      renderConcurrency: 1,
      restartMaxStarts: 3,
      restartWindowMs: 300_000,
    });
  });

  it("normalizes a well-formed service challenge", () => {
    expect(
      normalizeDaemonSidecarMessage({
        input: { clientNonce, protocolVersion: 1, role: "mcp" },
        type: SIDECAR_MESSAGES.SERVICE_CHALLENGE,
      }),
    ).toEqual({
      input: { clientNonce, protocolVersion: 1, role: "mcp" },
      type: "service-challenge",
    });
  });

  it("rejects unknown handshake fields", () => {
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { clientNonce, extra: true, protocolVersion: 1, role: "mcp" },
        type: SIDECAR_MESSAGES.SERVICE_CHALLENGE,
      }),
    ).toThrow(/unsupported fields/);
  });

  it("rejects an unknown client role", () => {
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { clientNonce, protocolVersion: 1, role: "agent" },
        type: SIDECAR_MESSAGES.SERVICE_CHALLENGE,
      }),
    ).toThrow(/role/);
  });

  it("rejects an incompatible protocol version", () => {
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { clientNonce, protocolVersion: 2, role: "mcp" },
        type: SIDECAR_MESSAGES.SERVICE_CHALLENGE,
      }),
    ).toThrow(/protocolVersion/);
  });

  it("requires proof material when acquiring a client lease", () => {
    expect(() =>
      normalizeDaemonSidecarMessage({
        input: { challengeId: "c1", clientNonce, protocolVersion: 1, role: "mcp" },
        type: SIDECAR_MESSAGES.ACQUIRE_SERVICE_CLIENT,
      }),
    ).toThrow(/proof/);
  });

  it("never accepts a role on renew or release", () => {
    // Roles are fixed at acquire time so a client cannot escalate itself.
    for (const type of [
      SIDECAR_MESSAGES.RENEW_SERVICE_CLIENT,
      SIDECAR_MESSAGES.RELEASE_SERVICE_CLIENT,
    ]) {
      expect(() =>
        normalizeDaemonSidecarMessage({
          input: {
            expiresAt: "2026-08-17T00:00:00.000Z",
            leaseId: "l1",
            nonce: clientNonce,
            role: "desktop",
            signature: "s".repeat(43),
          },
          type,
        }),
      ).toThrow(/unsupported fields/);
    }
  });

  it("does not accept a runtime descriptor as a stamp", () => {
    expect(() =>
      normalizeSidecarStamp({
        app: APP_KEYS.DAEMON,
        internalUrl: "http://127.0.0.1:1/",
        ipc: "/tmp/clean-design/ipc/contract-check/daemon.sock",
        mode: "runtime",
        namespace: "contract-check",
        source: SIDECAR_SOURCES.PACKAGED,
      }),
    ).toThrow(/unsupported fields/);
  });
});
