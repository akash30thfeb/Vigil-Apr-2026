/**
 * Shared context-aware chip/suggestion logic.
 * Used by both the web app (ResponseChips.tsx) and Slack bot (api/slack/events).
 * Single source of truth — any pattern changes apply to both platforms.
 */

function isWelcomeMessage(lower: string): boolean {
  return (
    lower.includes("what would you like to log") ||
    lower.includes("what would you like to track") ||
    lower.includes("what can i help") ||
    lower.includes("i can assist you with") ||
    lower.includes("i can help you with") ||
    lower.includes("i'm vigil") ||
    lower.includes("hi there") ||
    lower.includes("hello!")
  );
}

/**
 * Given an agent response, returns an array of suggestion chip labels.
 * Returns [] when no suggestions are appropriate (open-ended questions, mid-flow).
 */
export function getChips(message: string): string[] {
  const lower = message.toLowerCase();

  // Welcome / greeting — must be checked FIRST to avoid false matches on reminder/probation keywords
  if (isWelcomeMessage(lower)) {
    return ["Log a new hire", "Add a contract", "Track an asset", "Update a record"];
  }

  // Confirmation prompts — agent is asking to proceed with saving
  if (
    lower.includes("shall i go ahead") ||
    lower.includes("shall i log") ||
    lower.includes("shall i save") ||
    lower.includes("go ahead?") ||
    lower.includes("look right?") ||
    lower.includes("look correct?") ||
    lower.includes("want me to save") ||
    lower.includes("ready to save")
  ) {
    return ["Yes, go ahead", "Make a change first", "Cancel"];
  }

  // Post-save reminder suggestions — agent explicitly offers tracking automations
  if (
    (lower.includes("set up") && lower.includes("tracking")) ||
    lower.includes("tracking automation") ||
    (lower.includes("shall i set") && lower.includes("reminder")) ||
    (lower.includes("would you like") && lower.includes("reminder")) ||
    (lower.includes("suggest") && lower.includes("reminder"))
  ) {
    return ["Yes, set them up", "Skip reminders", "Customise the reminders"];
  }

  // Probation question — must be a direct question about a specific person
  if (
    lower.includes("probation") &&
    lower.includes("?") &&
    !lower.includes("existing") &&
    lower.length < 300
  ) {
    return ["Yes, 3 months", "Yes, 6 months", "No probation"];
  }

  // Employment type question
  if (lower.includes("full-time") && lower.includes("intern") && lower.includes("?")) {
    return ["Full-time", "Intern", "External consultant"];
  }

  // Department question
  if (lower.includes("which department") || lower.includes("what department")) {
    return ["Engineering", "Data Science", "IT", "Sales", "People Functions", "Data Analytics"];
  }

  // Follow-up after completion
  if (
    lower.includes("anything else") ||
    lower.includes("what else") ||
    lower.includes("can i help with")
  ) {
    return ["Log another record", "Add a reminder", "That's all for now"];
  }

  // Agent logged successfully
  if (lower.includes("logged successfully") || lower.includes("added successfully")) {
    return ["Add a reminder", "Log another record", "Done"];
  }

  // Agent asking what the reminder should be about
  if (lower.includes("what should the reminder") || lower.includes("what would you like the reminder")) {
    return []; // Let user type freely
  }

  // Yes/No for simple confirmations (but not for open-ended questions)
  if (
    lower.endsWith("?") &&
    lower.length < 200 &&
    (lower.includes("is that correct") || lower.includes("does that look") || lower.includes("is this correct"))
  ) {
    return ["Yes", "No"];
  }

  return [];
}
