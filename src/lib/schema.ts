import { z } from 'zod';

export const templateFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'color', 'url']),
  placeholder: z.string().optional(),
  optional: z.boolean().optional(),
  rows: z.number().optional()
});

export const templateThemeSchema = z.object({
  primaryColor: z.string(),
  accentColor: z.string(),
  backgroundColor: z.string(),
  surfaceColor: z.string().optional(),
  accent2Color: z.string().optional(),
  logoAssetId: z.string().optional()
});

export const layoutSettingsSchema = z.object({
  size: z.enum(['small', 'medium', 'large']).optional(),
  position: z.enum(['left', 'center', 'full']).optional(),
  density: z.enum(['compact', 'standard', 'bold']).optional(),
  safeMargin: z.enum(['normal', 'tight']).optional()
});

export const templateAnimationSchema = z.object({
  in: z.enum(['fade', 'slide', 'grow']),
  out: z.enum(['fade', 'slide', 'shrink'])
}).optional();

export const templateVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string()
});

export const templateDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  fields: z.array(templateFieldSchema),
  defaultValues: z.record(z.string(), z.string()),
  theme: templateThemeSchema,
  variants: z.array(templateVariantSchema).optional(),
  animation: templateAnimationSchema
});

export type TemplateDefinitionSchema = z.infer<typeof templateDefinitionSchema>;

export const graphicInstanceSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  presetName: z.string().optional(),
  values: z.record(z.string(), z.string()),
  theme: templateThemeSchema.partial(),
  assetRefs: z.record(z.string(), z.string()).optional(),
  personId: z.string().optional(),
  layout: layoutSettingsSchema.optional(),
  animationOverride: templateAnimationSchema,
  durationSeconds: z.number().min(0),
  createdAt: z.string(),
  updatedAt: z.string()
});
