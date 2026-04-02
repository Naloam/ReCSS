import { describe, expect, it } from "vitest";

import { parseJsxCode } from "../../src/parser/jsx-parser.js";

describe("parseJsxCode", () => {
  it("should extract classes from string className", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      `export function App(){ return <div className="foo bar" /> }`,
    );

    expect(result.used.has("foo")).toBe(true);
    expect(result.used.has("bar")).toBe(true);
  });

  it("should extract static and conditional classes from template literals", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      `export function App(){ return <div className={\`btn \${active ? 'active' : ''}\`} /> }`,
    );

    expect(result.used.has("btn")).toBe(true);
    expect(result.used.has("active")).toBe(true);
  });

  it("should extract classes from clsx calls", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      [
        `import clsx from 'clsx'`,
        `export function App(){`,
        `  return <div className={clsx('btn', { active: isActive }, cond && 'extra')} />`,
        `}`,
      ].join("\n"),
    );

    expect(result.used.has("btn")).toBe(true);
    expect(result.used.has("active")).toBe(true);
    expect(result.used.has("extra")).toBe(true);
  });

  it("should extract classes from dom class apis", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      [
        "export function applyTheme(root, element) {",
        '  root.classList.add("dark", "theme-ready");',
        '  root.classList.toggle("contrast");',
        '  root.classList.replace("old-theme", "new-theme");',
        '  element.setAttribute("class", "shell shell-ready");',
        '  element.className = active ? "is-active" : "is-idle";',
        "}",
      ].join("\n"),
    );

    expect(result.used.has("dark")).toBe(true);
    expect(result.used.has("theme-ready")).toBe(true);
    expect(result.used.has("contrast")).toBe(true);
    expect(result.used.has("old-theme")).toBe(true);
    expect(result.used.has("new-theme")).toBe(true);
    expect(result.used.has("shell")).toBe(true);
    expect(result.used.has("shell-ready")).toBe(true);
    expect(result.used.has("is-active")).toBe(true);
    expect(result.used.has("is-idle")).toBe(true);
  });

  it("should extract classes from React.createElement props", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      [
        'import React from "react";',
        "export function App(active: boolean) {",
        '  return React.createElement("div", { className: active ? "card" : "card-title" });',
        "}",
      ].join("\n"),
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("card-title")).toBe(true);
  });

  it("should extract classes from aliased react factory imports", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      [
        'import R, { createElement as h, cloneElement } from "react";',
        "export function App(active: boolean) {",
        '  const base = h("div", { className: "card" });',
        '  return R.cloneElement(base, { className: active ? "card" : "card-title" });',
        "}",
      ].join("\n"),
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("card-title")).toBe(true);
  });

  it("should extract classes from react factory variable aliases", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      [
        'import React from "react";',
        "export function App(active: boolean) {",
        "  const h = React.createElement;",
        "  const { cloneElement: clone } = React;",
        '  const base = h("div", { className: "card" });',
        '  return clone(base, { className: active ? "card" : "card-title" });',
        "}",
      ].join("\n"),
    );

    expect(result.used.has("card")).toBe(true);
    expect(result.used.has("card-title")).toBe(true);
  });

  it("should skip css modules member expression", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      `export function App(){ return <div className={styles.btn} /> }`,
    );

    expect(result.used.size).toBe(0);
    expect(result.uncertain.size).toBe(0);
  });

  it("should classify variable and call expressions as uncertain", () => {
    const result = parseJsxCode(
      "/virtual/App.tsx",
      [
        `export function App(){`,
        `  return (`,
        `    <>`,
        `      <div className={dynamicClass} />`,
        `      <div className={getClass()} />`,
        `    </>`,
        `  )`,
        `}`,
      ].join("\n"),
    );

    expect(result.uncertain.has("dynamicClass")).toBe(true);
    expect(
      [...result.uncertain].some((item) => item.includes("getClass")),
    ).toBe(true);
  });
});
