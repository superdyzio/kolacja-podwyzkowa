// A restaurant's venue templates (venue-templates, S-15). Server side; islands import the pure modules (./rules,
// ./preview, ./messages) directly.
export { CreateTemplateBody, UpdateTemplateBody } from "./api";
export { templateMessages, templateNameProblemText } from "./messages";
export { templateUpdatePreview } from "./preview";
export {
  parseTemplateName,
  TEMPLATE_ROUTE_PATTERNS,
  templateApiBase,
  templateMayRun,
  templatePath,
  venueNameKey,
  type TemplateRoutePattern,
} from "./rules";
export {
  applyVenueTemplate,
  createEventFromTemplate,
  createVenueTemplate,
  deleteVenueTemplate,
  findTemplateRow,
  getVenueTemplate,
  listVenueTemplates,
  previewTemplateUpdate,
  renameVenueTemplate,
  type ApplyTemplateResult,
  type CreateTemplateResult,
} from "./service";
