import createLeadTool from "./tools/create-lead";
import createLeadsTool from "./tools/create-leads";
import searchLeadsTool from "./tools/search-leads";
import updateLeadTool from "./tools/update-lead";
import logOutreachTool from "./tools/log-outreach";
import pipelineSummaryTool from "./tools/pipeline-summary";
import captureEmailTool from "./tools/capture-email";

export const crmTools = [
  searchLeadsTool,
  createLeadTool,
  createLeadsTool,
  updateLeadTool,
  logOutreachTool,
  pipelineSummaryTool,
  captureEmailTool,
];
