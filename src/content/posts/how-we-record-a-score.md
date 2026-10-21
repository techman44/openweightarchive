---
title: "A score is a claim until it can be repeated."
description: "What belongs beside a benchmark result, and why a submitted number is only the start of the record."
published: "2026-10-21"
category: "Methods"
author: "OpenWeightArchive"
---
A useful benchmark record explains what was measured and how. The model name matters, but so do the weight revision, quantization, prompt, task version and generation settings.

## Preserve the conditions

Our register retains the ct-bench arm, suite, thinking setting, maximum generated tokens, temperature, per-task score and sample count, timestamp, and declared hardware. We display task results separately rather than inventing an average across unrelated tests.

A score without samples is unavailable. A missing measurement is not a zero. Sorting a column does not make runs with different configurations comparable.

## A claim is not a reproduction

Submission records begin as claims. The planned verification protocol issues a signed nonce and selects a random five percent of the suite's task instances for our harness to run against the declared endpoint within 72 hours.

Only a passing reproduction can support a verified label. A small subset is a check on a specific claim, not proof that every result is correct, that a model is uncontaminated, or that the declared hardware served the request.

## The current edition

Phase 1 provides sample records, submission intake and an editorial queue. The automated reproduction service is not connected. No submitted score can receive verified status in this edition.

[Inspect the benchmark register](/benchmarks) or [submit a claim](/submit).
