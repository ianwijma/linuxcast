import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { release, arch } from "node:os";
import { configFixture, graphFixture, listFixture } from "../fixtures.ts";
import {
  acceptsAction,
  connect,
  edgeError,
  parseView,
  removeNode,
} from "../model.ts";
const rendererErrors: string[] = [];
test.beforeEach(({ page }) => {
  rendererErrors.length = 0;
  page.on("pageerror", (error) => rendererErrors.push(error.message));
});
test.afterEach(() => expect(rendererErrors).toEqual([]));
let server: ViteDevServer;
let url: string;
const evidence = fileURLToPath(new URL("../evidence/", import.meta.url));
test.beforeAll(async ({ browser }) => {
  server = await createServer({
    esbuild: { jsx: "automatic" },
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] },
    },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("No local test server");
  url = `http://127.0.0.1:${address.port}`;
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    `${evidence}platform.json`,
    JSON.stringify(
      {
        scope: "headless browser renderer only",
        platform: process.platform,
        architecture: arch(),
        kernel: release(),
        node: process.version,
        chromium: browser.version(),
        viewport: { width: 1440, height: 1100 },
        distro: readFileSync("/etc/os-release", "utf8")
          .split("\n")
          .find((line) => line.startsWith("PRETTY_NAME=")),
        limitations: [
          "No installed Electron validation",
          "No Debian desktop/session integration",
          "No real screen reader evidence",
        ],
      },
      null,
      2,
    ) + "\n",
  );
});
test.afterAll(async () => {
  await server?.close();
});
async function open(page: Page) {
  page.on("pageerror", (error) =>
    console.log("Renderer error:", error.message),
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Trim Text", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
}
async function tabTo(page: Page, name: string) {
  for (let i = 0; i < 80; i++) {
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute("aria-label") ??
        (document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement
          ? document.activeElement.labels?.[0]?.childNodes[0]?.textContent?.trim()
          : document.activeElement?.textContent) ??
        "",
    );
    if (focused === name) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard control unavailable: ${name}`);
}
test("S0-06-AC01 keyboard adds configures connects and removes a node", async ({
  page,
}) => {
  await open(page);
  await tabTo(page, "Add Trim Text");
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await tabTo(page, "Node label"); // labels are associated with inputs; tabTo fallback below handles input label via DOM.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Clean sample");
  await tabTo(page, "Apply configuration");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Clean sample utility.transform" }),
  ).toBeVisible();
  await tabTo(page, "Target node");
  await page.keyboard.press("End");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Nodes connected." }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await tabTo(page, "Remove node");
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(
    page.getByLabel("Search palette", { exact: true }),
  ).toBeFocused();
});
test("S0-06-AC02 rejects unrecognized ViewModel fields versions identities and action revisions", () => {
  expect(parseView(listFixture)).toEqual(listFixture);
  expect(parseView(configFixture(graphFixture.nodes[1]!, 1)).kind).toBe("form");
  const attacks = [
    { ...listFixture, protocolVersion: 2 },
    { ...listFixture, html: "<script>ignored</script>" },
    { ...listFixture, style: {} },
    {
      ...listFixture,
      sections: [
        {
          id: "s",
          title: "s",
          items: [{ id: "a", title: "界".repeat(22000), subtitle: "" }],
        },
      ],
    },
    {
      ...listFixture,
      selectedId: undefined,
      sections: [
        {
          id: "s",
          title: "s",
          items: Array.from({ length: 20 }, (_, i) => ({
            id: `item-${i}`,
            title: "a".repeat(60000),
            subtitle: "",
          })),
        },
      ],
    },
    { ...listFixture, revision: NaN },
    { ...listFixture, search: { ...listFixture.search, onChange: "code" } },
    {
      ...listFixture,
      sections: [
        {
          id: "nodes",
          title: "Nodes",
          items: [{ id: "x", title: "X", subtitle: "X", component: "unsafe" }],
        },
      ],
    },
    {
      ...listFixture,
      sections: [
        {
          id: "nodes",
          title: "Nodes",
          items: [
            { id: "x", title: "X", subtitle: "X" },
            { id: "x", title: "Y", subtitle: "Y" },
          ],
        },
      ],
    },
    JSON.parse('{"protocolVersion":1,"__proto__":{"polluted":true}}'),
    {
      ...configFixture(graphFixture.nodes[1]!, 1),
      fields: [
        {
          id: "x",
          kind: "password",
          title: "Secret",
          value: "",
          required: false,
        },
      ],
    },
    {
      ...listFixture,
      sections: [
        {
          id: "nodes",
          title: "Nodes",
          items: [{ id: "x", title: "x".repeat(65537), subtitle: "" }],
        },
      ],
    },
  ];
  for (const attack of attacks)
    expect(() => parseView(attack)).toThrow("Unsupported or invalid ViewModel");
  const form = configFixture(graphFixture.nodes[1]!, 4);
  expect(acceptsAction(form, 3, "save")).toBe(false);
  expect(acceptsAction(form, 4, "unknown")).toBe(false);
  expect(acceptsAction(form, 4, "save")).toBe(true);
});
test("S0-06-AC02 edge validator rejects incompatible types ports missing nodes duplicates and cycles", () => {
  const graph = structuredClone(graphFixture);
  graph.nodes.push({
    id: "number",
    type: "fixture.number",
    typeVersion: 1,
    label: "Number fixture",
    config: { text: "42" },
  });
  expect(edgeError(graph, "number", "trim")).toContain(
    "number output cannot connect to text input",
  );
  expect(edgeError(graph, "copy", "trim")).toContain("required ports");
  expect(edgeError(graph, "missing", "trim")).toContain("existing nodes");
  expect(edgeError(graph, "start", "trim", "unknown")).toContain(
    "unknown port",
  );
  expect(edgeError(graph, "start", "trim")).toContain("already exists");
  expect(edgeError(graph, "trim", "trim")).toContain("cycles");
  const next = connect({ ...graph, edges: [] }, "start", "trim", "new");
  expect(next.edges).toHaveLength(1);
  expect(removeNode(next, "trim").edges).toHaveLength(0);
  expect(graph.edges).toHaveLength(2);
});
test("layout editing does not change execution graph and form cancel preserves values", async ({
  page,
}) => {
  await open(page);
  await page.getByText("Inspect fixture graph data").click();
  const execution = await page.getByTestId("execution").textContent();
  const layout = await page.getByTestId("layout").textContent();
  await page.getByRole("button", { name: "Move node down" }).click();
  expect(await page.getByTestId("execution").textContent()).toBe(execution);
  expect(await page.getByTestId("layout").textContent()).not.toBe(layout);
  await page.getByLabel("Node label", { exact: true }).fill("Unapplied label");
  await expect(page.getByText("Unapplied changes")).toBeVisible();
  await page.getByRole("button", { name: "Cancel changes" }).click();
  await expect(page.getByLabel("Node label", { exact: true })).toHaveValue(
    "Trim Text",
  );
  expect(await page.getByTestId("execution").textContent()).toBe(execution);
  await page.getByLabel("Node label", { exact: true }).fill("");
  await page.getByRole("button", { name: "Apply configuration" }).click();
  await expect(page.getByText("Enter a value.")).toBeVisible();
  expect(await page.getByTestId("execution").textContent()).toBe(execution);
});
test("drafts survive attempted navigation and controls retain focus after apply and cancel", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Node label", { exact: true }).fill("Unsaved label");
  await page
    .getByRole("button", { name: "Keyword input.keyword", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Apply or cancel configuration changes before selecting another node.",
  );
  await expect(page.getByLabel("Node label", { exact: true })).toHaveValue(
    "Unsaved label",
  );
  await page.getByRole("button", { name: "Cancel changes" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel changes" }),
  ).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Node label", { exact: true }).fill("Saved label");
  await page.getByRole("button", { name: "Apply configuration" }).click();
  await expect(
    page.getByRole("button", { name: "Apply configuration" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Keyword input.keyword", exact: true })
    .focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("button", {
      name: "Saved label utility.transform",
      exact: true,
    }),
  ).toBeFocused();
});
test("invalid edge reason is visible and graph is unchanged", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add Number fixture" }).click();
  await expect(
    page.locator('.react-flow__node[data-id="node-1"]'),
  ).toBeInViewport();
  await page
    .getByRole("combobox", { name: "Target node", exact: true })
    .selectOption("trim");
  await page.getByRole("button", { name: "Connect selected node" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Connection rejected: number output cannot connect to text input.",
  );
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.screenshot({
    path: `${evidence}dark-invalid-edge.png`,
    fullPage: true,
  });
});
test("host list states are truthful and retry restores the fixture", async ({
  page,
}) => {
  await open(page);
  const state = page.getByRole("combobox", { name: "Fixture state" });
  await state.selectOption("loading");
  await expect(
    page
      .getByRole("region", { name: "Workflow nodes" })
      .getByText("Loading fixture rows…")
      .last(),
  ).toBeVisible();
  await page.screenshot({
    path: `${evidence}dark-loading.png`,
    fullPage: true,
  });
  await state.selectOption("empty");
  await expect(page.getByText("No nodes", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}dark-empty.png`, fullPage: true });
  await state.selectOption("error");
  await expect(page.getByRole("alert")).toContainText(
    "Fixture could not be loaded",
  );
  await page.screenshot({ path: `${evidence}dark-error.png`, fullPage: true });
  await page.getByRole("button", { name: "Retry local fixture" }).click();
  await expect(
    page.getByRole("region", { name: "Workflow nodes" }).getByRole("list"),
  ).toBeVisible();
  await state.selectOption("permission");
  await expect(
    page.getByText(
      "Clipboard permission required. Review permissions in the full client. This prototype cannot grant access.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use light appearance" }).click();
  await page.screenshot({
    path: `${evidence}light-permission.png`,
    fullPage: true,
  });
  await state.selectOption("cancelled");
  await expect(
    page.getByText("Preview cancelled. No clipboard operation was performed."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run unavailable" }),
  ).toBeDisabled();
  await page.screenshot({
    path: `${evidence}light-cancelled.png`,
    fullPage: true,
  });
  await state.selectOption("ready");
  await page
    .getByLabel("Search workflow nodes", { exact: true })
    .fill("no-such-node");
  await expect(
    page.getByText("No matching nodes", { exact: true }),
  ).toBeVisible();
});
test("dark and light host renderer pass WCAG AA automated accessibility", async ({
  page,
}) => {
  await open(page);
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByRole("button", { name: "Use light appearance" }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.getByLabel("Node label", { exact: true }).focus();
    await page.screenshot({
      path: `${evidence}${theme}-ready.png`,
      fullPage: true,
    });
  }
});
test("S0-06-PRIVACY renderer makes no external requests and rejects private payloads without echo", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await open(page);
  await page
    .getByRole("combobox", { name: "Fixture state" })
    .selectOption("permission");
  await page
    .getByRole("combobox", { name: "Fixture state" })
    .selectOption("cancelled");
  expect(
    requests.every((request) => new URL(request).hostname === "127.0.0.1"),
  ).toBe(true);
  const seededPrivateMarker = "synthetic-private-canary";
  expect(() =>
    parseView({ ...listFixture, credential: seededPrivateMarker }),
  ).toThrow("Unsupported or invalid ViewModel");
  try {
    parseView({ ...listFixture, credential: seededPrivateMarker });
  } catch (error) {
    expect(String(error)).not.toContain(seededPrivateMarker);
  }
  const fixtureSource = readFileSync(
    fileURLToPath(new URL("../fixtures.ts", import.meta.url)),
    "utf8",
  );
  expect(fixtureSource).not.toMatch(
    /(?:sk-[A-Za-z0-9]{16}|BEGIN .*PRIVATE KEY|Bearer [A-Za-z0-9])/,
  );
});
test("structured editor works with reduced motion forced colors 200% text and long CJK RTL labels", async ({
  page,
}) => {
  await open(page);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.locator("main").evaluate((el) => {
    (el as HTMLElement).style.setProperty("--type-body", "28px");
    (el as HTMLElement).style.setProperty("--type-caption", "24px");
    (el as HTMLElement).style.setProperty("--type-emphasis", "32px");
  });
  await page
    .getByLabel("Node label", { exact: true })
    .fill("長いノード名 · نموذج نص · " + "Sample ".repeat(10));
  await page.getByRole("button", { name: "Apply configuration" }).click();
  await expect(page.getByLabel("Node label", { exact: true })).toHaveValue(
    /長いノード名/,
  );
  await page.getByRole("button", { name: "Move node down" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Node moved down." }),
  ).toBeVisible();
  const paletteBounds = await page
    .getByRole("complementary", { name: "Node palette" })
    .boundingBox();
  for (const button of await page
    .getByRole("complementary", { name: "Node palette" })
    .getByRole("button")
    .all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      paletteBounds!.x + paletteBounds!.width,
    );
  }
  await page.screenshot({
    path: `${evidence}forced-colors-text-200.png`,
    fullPage: true,
  });
});
