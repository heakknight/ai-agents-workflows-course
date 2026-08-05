import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";
import { CUSTOMER_SUPPORT_MODEL } from "./lib/config.js";

export default defineAgent({
  model: openai(CUSTOMER_SUPPORT_MODEL),
});
