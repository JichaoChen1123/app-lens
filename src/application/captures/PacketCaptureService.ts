import { isAbsolute } from "node:path";
import type {
  AnalysisExecution,
  ExecutionOptions,
} from "../AnalysisProvider.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import {
  AnalysisCancelledError,
  AnalysisInputError,
  AnalysisOutputError,
} from "../../domain/analysisErrorCore.js";
import { createEvidence, type Evidence } from "../../domain/evidence.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import {
  inspectPacketCaptureInputSchema,
  packetCaptureSchema,
  type InspectPacketCaptureInput,
} from "../../domain/captures/packetCapture.js";
import { err, ok, type Result } from "../../domain/result.js";

export interface PacketCapturePort {
  /** Release per-call resources before returning, or retain failed cleanup for close/retry. */
  inspect(
    input: InspectPacketCaptureInput,
    options?: ExecutionOptions,
  ): Promise<Result<AnalysisExecution, AnalysisError>>;
  close(): Promise<void>;
}

/** One shared validation and Evidence owner for CLI and MCP. */
export class PacketCaptureService {
  constructor(readonly provider: PacketCapturePort) {}
  close(): Promise<void> {
    return this.provider.close();
  }
  async inspect(
    raw: unknown,
    options?: ExecutionOptions,
  ): Promise<Result<Evidence, AnalysisError>> {
    const operation = "inspect_packet_capture";
    if (options?.signal?.aborted)
      return err(new AnalysisCancelledError(operation));
    const input = inspectPacketCaptureInputSchema.safeParse(raw);
    if (!input.success)
      return err(
        analysisInputErrorFromIssues(operation, input.error.issues, raw, {
          cause: input.error,
        }),
      );
    if (!isAbsolute(input.data.path))
      return err(
        new AnalysisInputError(operation, undefined, [
          {
            path: ["path"],
            reason: "invalid_format",
            message: "Expected an absolute local path.",
          },
        ]),
      );
    const decoded = await this.provider.inspect(input.data, options);
    if (!decoded.ok) return decoded;
    const execution = decoded.value;
    const report = packetCaptureSchema.safeParse(execution.result);
    if (
      !report.success ||
      report.data.artifact.path !== input.data.path ||
      execution.subject?.path !== input.data.path ||
      execution.subject.sha256 !== report.data.artifact.sha256 ||
      JSON.stringify(report.data.selection) !== JSON.stringify(input.data)
    )
      return err(
        new AnalysisOutputError(
          operation,
          "Capture analyzer returned malformed data or changed the selected artifact identity/options.",
        ),
      );
    const evidence = createEvidence(execution.subject, execution.provider, {
      operation,
      parameters: input.data,
      result: report.data,
      confidence: "observed",
      locations: execution.locations,
      limitations: execution.limitations,
    });
    return options?.signal?.aborted
      ? err(
          new AnalysisCancelledError(operation, {
            partialObservation: evidence,
          }),
        )
      : ok(evidence);
  }
}
