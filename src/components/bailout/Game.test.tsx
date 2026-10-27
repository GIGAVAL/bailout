import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Game } from "./Game";

afterEach(cleanup);

function pullMember(container: HTMLElement, id: string) {
  const title = Array.from(container.querySelectorAll("svg title")).find((element) => element.textContent?.startsWith(`${id} `));
  const group = title?.parentElement;
  if (!group) throw new Error(`Member ${id} not found`);
  fireEvent.click(group);
}

describe("Terminal controls preserve game behavior", () => {
  it("F1 undoes a crashing pull and unfreezes the frame", () => {
    const { container } = render(<Game />);
    pullMember(container, "C3-2");
    pullMember(container, "C4-2");
    expect(container.querySelector(".terminal-crashed")).not.toBeNull();
    fireEvent.keyDown(window, { key: "F1" });
    expect(container.querySelector(".terminal-crashed")).toBeNull();
    expect(container.querySelectorAll("svg title")).toHaveLength(54);
    expect(Array.from(container.querySelectorAll("svg title")).filter((node) => node.textContent?.endsWith("pulled"))).toHaveLength(1);
  });

  it("F2 restores every removed member", () => {
    const { container } = render(<Game />);
    pullMember(container, "C3-2");
    fireEvent.keyDown(window, { key: "F2" });
    expect(Array.from(container.querySelectorAll("svg title")).filter((node) => node.textContent?.endsWith("pulled"))).toHaveLength(0);
    expect(container.querySelector("#bet")).not.toBeNull();
  });

  it("F4 places the same $100 short and settles the exact crashing pull", () => {
    const { container } = render(<Game />);
    const input = container.querySelector("#bet");
    if (!input) throw new Error("Short input missing");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.keyDown(window, { key: "F4" });
    expect(container.querySelector("#bet")).toBeNull();
    pullMember(container, "C3-2");
    pullMember(container, "C4-2");
    const cells = container.querySelectorAll(".short-results tbody td");
    expect(cells[0]?.textContent).toBe("#2");
    expect(cells[1]?.textContent).toBe("#2");
    expect(cells[3]?.textContent).toBe("+$5,002");
    pullMember(container, "C1-1");
    expect(Array.from(container.querySelectorAll("svg title")).filter((node) => node.textContent?.endsWith("pulled"))).toHaveLength(2);
  });
});