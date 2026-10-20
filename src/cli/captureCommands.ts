import { z } from "incur";
import type { PacketCaptureService } from "../application/captures/PacketCaptureService.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { analysisErrorWithCleanupFailure } from "../domain/analysisErrorCleanup.js";
import { ProviderCleanupError } from "../domain/providerCleanupError.js";
import { resolve } from "node:path";
import { createPacketCaptureService } from "../composition/captures.js";
import {
  packetCaptureOptionsSchema,
  packetCaptureSelectorBudgetIssue,
  withinPacketCaptureSelectorBudget,
} from "../domain/captures/packetCapture.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";
export const registerCaptureCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
  service: Pick<
    PacketCaptureService,
    "inspect" | "close"
  > = createPacketCaptureService(environment),
): void => {
  cli.command(CLI_COMMANDS.inspectPacketCapture, {
    description:
      "Inspect an existing packet capture with caller-supplied TShark",
    args: z.object({ path: z.string().describe("Local packet capture") }),
    options: z
      .object({
        ...packetCaptureOptionsSchema.shape,
        match_limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Returned matching frames per page; default 50"),
        all_matches: z
          .boolean()
          .default(false)
          .describe(
            "Return all remaining matching frames instead of a bounded page",
          ),
      })
      .superRefine((options, context) => {
        if (options.all_matches && options.match_limit !== undefined)
          context.addIssue({
            code: "custom",
            path: ["all_matches"],
            message: "all_matches and match_limit are mutually exclusive",
          });
      })
      .refine(
        withinPacketCaptureSelectorBudget,
        packetCaptureSelectorBudgetIssue,
      ),
    run: ({ args, options: { all_matches, ...options } }) =>
      withCommandCancellation((signal) =>
        logCliCommand(logger, CLI_COMMANDS.inspectPacketCapture, async () => {
          const result = await service.inspect(
            {
              ...options,
              ...(all_matches ? { match_limit: null } : {}),
              path: resolve(args.path),
            },
            { signal },
          );
          // A one-shot command must retry retained cleanup before discarding its owner.
          try {
            await service.close();
          } catch (cause) {
            const cleanup =
              cause instanceof AnalysisError
                ? cause
                : new ProviderCleanupError(
                    "tshark-capture",
                    [],
                    { reason: String(cause) },
                    { cause, operation: "inspect_packet_capture" },
                  );
            if (result.ok) cleanup.retainPartialObservation(result.value);
            return projectAnalysisError(
              result.ok
                ? cleanup
                : analysisErrorWithCleanupFailure(
                    result.error,
                    cleanup,
                    "inspect_packet_capture",
                  ),
            );
          }
          return result.ok ? result.value : projectAnalysisError(result.error);
        }),
      ),
  });
};
