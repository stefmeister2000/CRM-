import { defineTool } from "../tool";
import { supabaseForUser } from "../supabase";
import { captureEmail, emailCaptureSchema } from "../email-capture";

export default defineTool({
  name: "capture_email_draft",
  title: "Save email lead and message",
  description:
    "Create or match a CRM lead and save an email draft or a confirmed sent email. Does not send email or read a mailbox. Use only when the user asks to save this contact and message. Never mark a draft as sent without confirmation that sending succeeded.",
  inputSchema: emailCaptureSchema.shape,
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    try {
      const result = await captureEmail(supabaseForUser(ctx), input, ctx.getUserId()!);
      return {
        content: [
          {
            type: "text",
            text: `${result.created ? "Created" : "Matched"} lead ${result.leadId} and saved the ${result.emailStatus === "sent" ? "sent email" : "draft"}.`,
          },
        ],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Could not save the email.",
          },
        ],
        isError: true,
      };
    }
  },
});
