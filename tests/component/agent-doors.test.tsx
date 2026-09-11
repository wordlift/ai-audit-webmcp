// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentDoors } from "../../src/client/components/AgentDoors";
import { askAgentPrompt, reviewPrompt } from "../../src/client/components/reviewPrompt";

const REPORT = "4a8a04c0-e247-4bec-a440-d9f3506f9212";

describe("work with an agent, one fold, two doors", () => {
  it("copies the prompt that reads the model, and the one that interviews the team, each from its own button", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AgentDoors reportId={REPORT} />);
    expect(screen.getByText("Work with an agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ask ChatGPT about this business/ }));
    expect(writeText).toHaveBeenLastCalledWith(askAgentPrompt(REPORT));
    expect(await screen.findByRole("button", { name: /Prompt copied/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review with ChatGPT/ }));
    expect(writeText).toHaveBeenLastCalledWith(reviewPrompt(REPORT));
    expect(askAgentPrompt(REPORT)).toContain("inspect-business-model");
    expect(reviewPrompt(REPORT)).toContain("inspect-terms-of-action");
  });
});
