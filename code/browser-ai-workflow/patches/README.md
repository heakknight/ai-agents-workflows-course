# Dependency patches

## `@huggingface/transformers@4.2.0`

`@huggingface+transformers+4.2.0.patch` backports the Gemma 4 generation fix from [Transformers.js PR #1681](https://github.com/huggingface/transformers.js/pull/1681). Stable 4.2.0 sets `num_logits_to_keep` for generation but `Gemma3nForConditionalGeneration.forward()` drops it before the decoder call. The patch adds the two upstream forwarding lines to the published source and browser bundle used by Vite.

Remove the patch only after upgrading to a stable `@huggingface/transformers` release that contains PR #1681 **and** rerunning the same Gemma 4 text-only WebGPU feasibility checks. Then delete this patch, remove `patch-package` and the `postinstall` script if no patches remain, and regenerate `package-lock.json`.
