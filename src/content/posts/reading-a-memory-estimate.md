---
title: "The number beside VRAM needs a footnote."
description: "Weight size, context length and runtime overhead belong in the same deployment record."
published: "2026-10-20"
category: "Archive notes"
author: "OpenWeightArchive"
---
The archive's memory matrix separates the size of the weights from the memory needed to run them. Each row names a quantization; each context column records a distinct condition.

## State the basis

Every memory value is marked as estimated or measured. A measured value should eventually link to the runtime version, cache format, batch size, context length, offload configuration and peak-memory observation that produced it.

An estimate helps plan a trial. It is not a promise that a particular device can run the model at the stated context length.

## Leave gaps visible

The reference records contain deliberate gaps. An unavailable value stays visible as unavailable instead of being inferred from another quantization or replaced with a zero.

The current Spark record reports a 2.68 GB KV cache per rank. It does not establish total VRAM requirements at other context lengths. Missing memory measurements remain unavailable; no extrapolated memory matrix is published.
