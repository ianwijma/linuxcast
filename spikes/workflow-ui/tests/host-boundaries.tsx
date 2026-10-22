import { createRoot } from "react-dom/client";
import { HostForm, HostList } from "../host/Views.tsx";
import { configFixture, graphFixture } from "../fixtures.ts";
import { parseView } from "../model.ts";

/** Synthetic component boundary fixtures, loaded only by the UI tests. */
export function mountBlockedForm() {
  const container = document.createElement("section");
  container.id = "boundary-fixture";
  document.body.replaceChildren(container);
  container.dataset.submissions = "0";
  container.dataset.cancellations = "0";
  const view = configFixture(graphFixture.nodes[1]!, 1);
  for (const action of view.actions ?? []) action.disabledReason = "Synthetic policy denial";
  parseView(view);
  createRoot(container).render(<HostForm view={view} onDirtyChange={() => {}} onSubmit={() => { container.dataset.submissions = String(Number(container.dataset.submissions) + 1); }} onCancel={() => { container.dataset.cancellations = String(Number(container.dataset.cancellations) + 1); }} />);
}

export function mountDisabledList() {
  const container = document.createElement("section");
  document.body.replaceChildren(container);
  createRoot(container).render(<HostList onSelect={() => {}} view={{ protocolVersion: 1, kind: "list", viewId: "disabled-rows", revision: 1, title: "Synthetic rows", search: { placeholder: "Search", query: "", mode: "host" }, sections: [{ id: "rows", title: "Rows", items: [{ id: "first", title: "First", subtitle: "" }, { id: "blocked", title: "Blocked", subtitle: "", disabledReason: "Synthetic policy denial" }, { id: "last", title: "Last", subtitle: "" }] }] }} />);
}
