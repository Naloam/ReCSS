import { z } from "zod";

const FileMatchSchema = z
  .object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
  })
  .default({
    include: [],
    exclude: [],
  });

const ReportSchema = z
  .object({
    format: z.enum(["console", "json", "html", "markdown"]).default("console"),
    outfile: z.string().optional(),
    minUnusedThreshold: z.number().default(0),
  })
  .default({
    format: "console",
    minUnusedThreshold: 0,
  });

export const ConfigSchema = z.object({
  root: z.string().default("."),
  css: FileMatchSchema,
  sources: FileMatchSchema,
  framework: z.enum(["auto", "vue", "react", "html"]).default("auto"),
  safelist: z.array(z.union([z.string(), z.instanceof(RegExp)])).default([]),
  report: ReportSchema,
});

export type RecssCoreConfig = z.infer<typeof ConfigSchema>;

export function normalizeConfig(input: unknown): RecssCoreConfig {
  return ConfigSchema.parse(input);
}
