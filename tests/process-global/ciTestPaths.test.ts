import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { parse } from "yaml";
import { z } from "zod";

const WORKFLOWS = join(".github", "workflows");

const workflowSchema = z.object({
  jobs: z.record(
    z.string(),
    z.object({
      steps: z.array(z.object({ run: z.string().optional() })).optional(),
    }),
  ),
});

/** Test paths named by explicit vitest or focused-test steps in every CI workflow. */
const explicitPaths = async (): Promise<string[]> => {
  const files = (await readdir(WORKFLOWS)).filter((name) =>
    /\.ya?ml$/u.test(name),
  );
  const runs = (
    await Promise.all(
      files.map(async (name) => {
        const workflow = workflowSchema.parse(
          parse(await readFile(join(WORKFLOWS, name), "utf8")),
        );
        return Object.values(workflow.jobs)
          .flatMap((job) => job.steps ?? [])
          .map((step) => step.run?.trim())
          .filter(
            (value): value is string =>
              value?.includes("npx vitest run ") === true ||
              value?.startsWith("npm run test:focused -- ") === true,
          );
      }),
    )
  ).flat();
  expect(runs.length, "expected explicit CI test invocations").toBeGreaterThan(
    0,
  );
  return [
    ...new Set(
      runs.flatMap((run) =>
        run.split(/\s+/u).filter((token) => token.endsWith(".test.ts")),
      ),
    ),
  ].sort();
};

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

it("keeps every explicit CI test path executable after file moves", async () => {
  const paths = await explicitPaths();
  expect(paths.length).toBeGreaterThan(0);
  const missing = await Promise.all(
    paths.map(async (path) => ((await exists(path)) ? undefined : path)),
  );
  expect(missing.filter((path) => path !== undefined)).toEqual([]);
}, 10_000);
