import { defaultBackend, defineSandbox } from "eve/sandbox";

// Knowledge-base Markdown is available in the sandbox; customer mutations stay in authored tools.
export default defineSandbox({
  backend: defaultBackend({
    vercel: { networkPolicy: "deny-all" },
    docker: { networkPolicy: "deny-all" },
    microsandbox: { networkPolicy: "deny-all" },
  }),
});
