import { csvEnv } from "../lib/config.js";
import { defaultSlackAuth, loadThreadContextMessages, slackChannel } from "eve/channels/slack";

function allowedSlackUserIds(): string[] {
  return csvEnv("ALLOWED_SLACK_USER_IDS");
}

function isAllowedUser(userId: string | undefined): boolean {
  const allowed = allowedSlackUserIds();
  // When no allowlist is configured, all users are blocked. Set ALLOWED_SLACK_USER_IDS to enable Slack.
  if (allowed.length === 0) return false;
  return Boolean(userId && allowed.includes(userId));
}

export default slackChannel({
  // Credentials fall back to SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET.
  async onAppMention(ctx, message) {
    if (!isAllowedUser(message.author?.userId)) return null;
    const auth = defaultSlackAuth(message, ctx);
    const prior = await loadThreadContextMessages(ctx.thread, message, {
      since: "last-agent-reply",
    });
    if (prior.length === 0) return { auth };

    const transcript = prior
      .map((entry) => `${entry.isMe ? "you" : (entry.user ?? "user")}: ${entry.markdown}`)
      .join("\n");

    return {
      auth,
      context: [`Recent Slack thread messages since your last reply:\n\n${transcript}`],
    };
  },
  async onDirectMessage(ctx, message) {
    if (!isAllowedUser(message.author?.userId)) return null;
    return { auth: defaultSlackAuth(message, ctx) };
  },
});
