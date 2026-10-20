import { ArtifactReaderFailure } from "../artifacts/ArtifactReader.js";
import { ArtifactResourceScope } from "../artifacts/ArtifactResourceScope.js";
import { readStableArtifact } from "../artifacts/readStableArtifact.js";
import {
  AnalysisError,
  type AnalysisCapturedOutput,
  type AnalysisPartialObservation,
} from "../domain/analysisErrorBase.js";
import {
  AnalysisCancelledError,
  AnalysisResourceConstraintError,
  AnalysisOutputError,
  AnalysisTimeoutError,
} from "../domain/analysisErrorCore.js";
import { analysisErrorWithCleanupFailure } from "../domain/analysisErrorCleanup.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import { ProviderCleanupError } from "../domain/providerCleanupError.js";
import type { JsonValue } from "../domain/jsonValue.js";
import { err, type Result } from "../domain/result.js";
import {
  readLinuxResourceLimits,
  type LinuxResourceLimits,
} from "./LinuxResourceLimits.js";
import type { PrivateRuntimeRoot } from "./PrivateRuntimeRoot.js";
import type { ProviderProcessSupervisor } from "./ProviderProcess.js";
import { OwnedCommandFailure } from "./OwnedCommand.js";

export type ArtifactAnalysisRuntime = Pick<
  PrivateRuntimeRoot,
  "path" | "close"
>;

/** Own admission, artifact descriptors, producer cleanup and private workspaces together. */
export class ArtifactAnalysisResources {
  readonly #artifacts = new ArtifactResourceScope();
  readonly #pending = new Map<
    ArtifactAnalysisRuntime,
    ProviderProcessSupervisor | undefined
  >();
  #tail: Promise<void> = Promise.resolve();
  #busy = false;
  #closed = false;

  constructor(
    readonly providerId: string,
    readonly operation: string,
    readonly readArtifact: typeof readStableArtifact,
    readonly readKernelLimits: typeof readLinuxResourceLimits,
    readonly capacity: {
      readonly message: string;
      readonly details: Readonly<Record<string, JsonValue>>;
    },
  ) {}

  run<T>(
    work: () => Promise<Result<T, AnalysisError>>,
    signal?: AbortSignal,
  ): Promise<Result<T, AnalysisError>> {
    if (this.#closed || signal?.aborted)
      return Promise.resolve(err(new AnalysisCancelledError(this.operation)));
    if (this.#busy)
      return Promise.resolve(
        err(
          new AnalysisResourceConstraintError(
            this.operation,
            "capacity",
            this.capacity.message,
            this.capacity.details,
          ),
        ),
      );
    this.#busy = true;
    const running = this.#tail
      .then(() => this.#artifacts.run(work))
      .catch((cause: unknown) => err(this.#artifactFailure(cause)))
      .finally(() => {
        this.#busy = false;
      });
    this.#tail = running.then(
      () => undefined,
      () => undefined,
    );
    return running;
  }

  read(path: string, maximumBytes: number, signal?: AbortSignal) {
    return this.readArtifact(
      path,
      maximumBytes,
      signal,
      undefined,
      this.#artifacts,
    );
  }

  readLimits(limits: LinuxResourceLimits): Promise<LinuxResourceLimits> {
    return this.readKernelLimits(limits, this.#artifacts);
  }

  retain(
    root: ArtifactAnalysisRuntime,
    owner?: ProviderProcessSupervisor,
  ): void {
    this.#pending.set(root, owner);
  }

  get pendingPaths(): readonly string[] {
    return [...this.#pending.keys()].map((root) => root.path);
  }

  async release(): Promise<void> {
    for (const [root, owner] of this.#pending) {
      try {
        if (owner !== undefined) {
          const stopped = await owner.stop();
          if (stopped.status === "incomplete") throw new Error(stopped.reason);
          this.#pending.set(root, undefined);
        }
        await root.close();
        this.#pending.delete(root);
      } catch (cause: unknown) {
        throw new ProviderCleanupError(
          this.providerId,
          [root.path],
          { reason: String(cause) },
          { operation: this.operation, cause },
        );
      }
    }
  }

  cleanupFailure(
    observation: NonNullable<ArtifactReaderFailure["cleanup"]>,
    cause: unknown,
    capturedOutput?: AnalysisCapturedOutput,
  ): ProviderCleanupError {
    return new ProviderCleanupError(
      this.providerId,
      observation.resources,
      {
        reason: observation.reason,
        ...(capturedOutput === undefined
          ? {}
          : { captured_output: { ...capturedOutput } }),
      },
      { operation: this.operation, cause },
    );
  }

  commandFailure(
    cause: OwnedCommandFailure,
    limits: {
      readonly command_timeout_ms: number;
      readonly output_bytes: number;
    },
    effectiveLimits: LinuxResourceLimits | undefined,
  ): AnalysisError {
    const capturedOutput =
      cause.snapshot === null
        ? undefined
        : {
            stdout: cause.snapshot.stdout.text,
            stderr: cause.snapshot.stderr.text,
            truncated: cause.snapshot.diagnosticTruncated ?? false,
            exit_code: cause.snapshot.exitCode ?? null,
            signal: cause.snapshot.signal ?? null,
          };
    const detail = {
      cause,
      ...(capturedOutput === undefined ? {} : { capturedOutput }),
    };
    if (cause.reason === "cancelled")
      return new AnalysisCancelledError(this.operation, detail);
    if (cause.reason === "timeout")
      return new AnalysisTimeoutError(
        this.operation,
        limits.command_timeout_ms,
        detail,
      );
    if (cause.reason === "output-limit")
      return new AnalysisResourceConstraintError(
        this.operation,
        "memory",
        cause.message,
        { output_bytes: limits.output_bytes },
        detail,
      );
    if (
      cause.reason === "process" &&
      (cause.snapshot?.signal === "SIGXFSZ" ||
        cause.snapshot?.signal === "SIGXCPU")
    )
      return new AnalysisResourceConstraintError(
        this.operation,
        cause.snapshot.signal === "SIGXFSZ" ? "file-size" : "cpu",
        `Producer terminated with ${cause.snapshot.signal}; the signal's exact cause is not independently established.`,
        effectiveLimits === undefined ? null : { ...effectiveLimits },
        detail,
      );
    return new AnalysisOutputError(this.operation, cause.message, detail);
  }

  async finish<T>(
    result: Result<T, AnalysisError>,
    observation: (value: T) => AnalysisPartialObservation,
  ): Promise<Result<T, AnalysisError>> {
    try {
      await this.release();
      return result;
    } catch (cause: unknown) {
      const partialObservation = result.ok
        ? observation(result.value)
        : result.error.partialObservation;
      return err(
        new ProviderCleanupError(
          this.providerId,
          this.pendingPaths,
          {
            reason: String(cause),
            previous_error: result.ok
              ? null
              : projectAnalysisError(result.error),
          },
          {
            operation: this.operation,
            cause,
            ...(partialObservation === undefined ? {} : { partialObservation }),
          },
        ),
      );
    }
  }

  close(): Promise<void> {
    this.#closed = true;
    const work = this.#tail.then(() => this.#closeResources());
    this.#tail = work.catch(() => undefined);
    return work;
  }

  async #closeResources(): Promise<void> {
    let descriptorFailure: AnalysisError | undefined;
    try {
      await this.#artifacts.close();
    } catch (cause: unknown) {
      descriptorFailure = this.#artifactFailure(cause);
    }
    try {
      await this.release();
    } catch (cause: unknown) {
      if (descriptorFailure !== undefined && cause instanceof AnalysisError)
        throw analysisErrorWithCleanupFailure(
          descriptorFailure,
          cause,
          this.operation,
        );
      throw cause;
    }
    if (descriptorFailure !== undefined) throw descriptorFailure;
  }

  #artifactFailure(cause: unknown): AnalysisError {
    if (cause instanceof AnalysisError) return cause;
    if (cause instanceof ArtifactReaderFailure && cause.cleanup !== undefined)
      return this.cleanupFailure(cause.cleanup, cause);
    return new ProviderAdapterError(this.providerId, this.operation, {
      cause,
      diagnostics: { stage: "artifact-resources", reason: String(cause) },
    });
  }
}
