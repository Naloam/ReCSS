import { describe, expect, it } from "vitest";

import { parseVueCode } from "../../src/parser/vue-parser.js";

describe("parseVueCode", () => {
  it("should extract static class names from template class attribute", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      `<template><div class="card card-header"></div></template>`,
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("card-header")).toBe(true);
    expect(result.uncertain.size).toBe(0);
  });

  it("should extract class names from object class binding", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      `<template><div :class="{ active: isActive, 'is-ready': ready }"></div></template>`,
    );

    expect(result.used.has("active")).toBe(true);
    expect(result.used.has("is-ready")).toBe(true);
  });

  it("should extract class names from array class binding", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      `<template><div :class="['foo', condition ? 'bar' : 'baz']"></div></template>`,
    );

    expect(result.used.has("foo")).toBe(true);
    expect(result.used.has("bar")).toBe(true);
    expect(result.used.has("baz")).toBe(true);
  });

  it("should extract class names from mixed binding syntax", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      `<template><div :class="['static', { dynamic: flag }]"></div></template>`,
    );

    expect(result.used.has("static")).toBe(true);
    expect(result.used.has("dynamic")).toBe(true);
  });

  it("should extract class names from vue class helper calls", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      [
        "<template>",
        `  <div :class="clsx('card', active && 'active')"></div>`,
        "</template>",
        '<script setup lang="ts">',
        'import clsx from "clsx";',
        "</script>",
      ].join("\n"),
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("active")).toBe(true);
  });

  it("should extract class names from vue class helper aliases", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      [
        "<template>",
        `  <div :class="cx('card', isReady && 'is-ready')"></div>`,
        "</template>",
        '<script setup lang="ts">',
        'import clsx from "clsx";',
        "const cx = clsx.bind(null);",
        "</script>",
      ].join("\n"),
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("is-ready")).toBe(true);
  });

  it("should extract class names from vue array-based class call chains", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      [
        "<template>",
        `  <div :class="['card'].concat(isReady ? ['is-ready'] : []).filter?.(Boolean)?.join(' ')"></div>`,
        "</template>",
      ].join("\n"),
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("is-ready")).toBe(true);
    expect(result.uncertain.size).toBe(0);
  });

  it("should put pure variable class binding into uncertain set", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      `<template><div :class="dynamicClass"></div></template>`,
    );

    expect(result.uncertain.has("dynamicClass")).toBe(true);
  });

  it("should skip file when useCssModule is detected in script setup", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      [
        '<template><div class="should-not-collect"></div></template>',
        '<script setup lang="ts">',
        "useCssModule()",
        "</script>",
      ].join("\n"),
    );

    expect(result.used.size).toBe(0);
    expect(result.uncertain.size).toBe(0);
  });

  it("should skip file when useCssModule is detected in script", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      [
        '<template><div class="should-not-collect"></div></template>',
        '<script lang="ts">',
        "export default {",
        "  setup() {",
        "    const styles = useCssModule();",
        "    return { styles };",
        "  },",
        "};",
        "</script>",
      ].join("\n"),
    );

    expect(result.used.size).toBe(0);
    expect(result.uncertain.size).toBe(0);
  });

  it("should skip file when style module syntax is present", () => {
    const result = parseVueCode(
      "/virtual/App.vue",
      [
        '<template><div class="should-not-collect" :class="{ active: isActive }"></div></template>',
        '<script setup lang="ts">',
        "const isActive = true;",
        "</script>",
        '<style module src="./card.module.scss"></style>',
      ].join("\n"),
    );

    expect(result.used.size).toBe(0);
    expect(result.uncertain.size).toBe(0);
  });
});
