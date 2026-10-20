export type HopperPrivateDisplayStrategy =
  | "direct"
  | "user-mount-namespace"
  | "unavailable";

const failures = [
  [
    70,
    "private_display_unavailable",
    "AppLens could not start its private Linux display. Install Xvfb, then rerun applens doctor.",
  ],
  [
    71,
    "x11_authorization_failed",
    "AppLens could not authorize its private Linux display. Install xauth, then rerun applens doctor.",
  ],
  [
    72,
    "unsupported_hopper_build",
    "This Hopper build is not supported for unattended Linux analysis. Unset HOPPER_LAUNCHER_PATH and rerun applens setup --yes --install-hopper, or update AppLens.",
  ],
  [
    73,
    "invalid_launch_command",
    "AppLens refused an unexpected Hopper launch command. Check HOPPER_LAUNCHER_PATH and rerun applens doctor.",
  ],
  [
    74,
    "process_ownership_mismatch",
    "AppLens could not verify ownership of the launched Hopper process and stopped safely. Close other Hopper sessions and retry.",
  ],
  [
    75,
    "hopper_exited_during_startup",
    "Hopper exited before the AppLens bridge was ready. In CI, run applens doctor --provider hopper --json; if Hopper showed a UI or license prompt, complete it in the runner user session, otherwise close stale Hopper sessions and retry.",
  ],
  [
    76,
    "unsupported_demo_dialog",
    "This Hopper demo dialog is not supported for unattended Linux analysis. Update AppLens or use a supported Hopper build.",
  ],
  [
    77,
    "unexpected_display_geometry",
    "AppLens's private Linux display did not match the validated layout. Close custom display overrides and retry.",
  ],
  [
    78,
    "x11_input_failed",
    "AppLens could not activate Hopper's validated demo control. Install the XTEST runtime, then rerun applens doctor.",
  ],
  [
    79,
    "runtime_dependency_unavailable",
    "A Linux demo-session dependency is unavailable. Rerun applens setup --yes --install-hopper, then applens doctor.",
  ],
  [
    80,
    "x11_socket_directory_unusable",
    "AppLens cannot use the host X11 socket directory for a private display. Run applens doctor --provider hopper for exact mount and namespace diagnostics.",
  ],
] as const;

export type HopperStartupFailureCode = (typeof failures)[number][1];

interface HopperStartupDiagnosticContext {
  readonly component: "hopper_private_display";
  readonly operation: "probe" | "launch";
  readonly reason: string;
  readonly socket_directory: "/tmp/.X11-unix";
  readonly socket_directory_mode: string | null;
  readonly mount_read_only: boolean | null;
  readonly effective_socket_directory_mode: string | null;
  readonly effective_mount_read_only: boolean | null;
  readonly wsl: boolean;
  readonly strategy: HopperPrivateDisplayStrategy;
  readonly fallback_reason: string | null;
  readonly xvfb_stderr_bytes: number;
}

/** Non-secret facts emitted by the Linux private-display adapter. */
export type HopperStartupDiagnostic = HopperStartupDiagnosticContext &
  (
    | {
        readonly status: "ready";
        readonly failure_code: null;
      }
    | {
        readonly status: "error";
        readonly failure_code: HopperStartupFailureCode;
      }
  );

/** A parsed Linux private-display diagnostic that reports startup failure. */
export type HopperStartupFailureDiagnostic = Extract<
  HopperStartupDiagnostic,
  { readonly status: "error" }
>;

/** A parsed Linux private-display diagnostic that reports readiness. */
export type HopperStartupReadyDiagnostic = Extract<
  HopperStartupDiagnostic,
  { readonly status: "ready" }
>;

const HOPPER_STARTUP_FAILURES = new Map<
  number,
  { readonly code: HopperStartupFailureCode; readonly message: string }
>(failures.map(([exitCode, code, message]) => [exitCode, { code, message }]));

/** Return the stable public failure associated with a Linux demo adapter exit. */
export const hopperStartupFailure = (exitCode: number | null) =>
  exitCode === null ? undefined : HOPPER_STARTUP_FAILURES.get(exitCode);

/** Return the adapter exit associated with one stable startup failure code. */
export const hopperStartupExitCode = (
  code: HopperStartupFailureCode,
): number | undefined =>
  failures.find(([, candidate]) => candidate === code)?.[0];

/** Narrow an untrusted diagnostic field to the public startup code union. */
export const isHopperStartupFailureCode = (
  value: string,
): value is HopperStartupFailureCode =>
  failures.some(([, candidate]) => candidate === value);
