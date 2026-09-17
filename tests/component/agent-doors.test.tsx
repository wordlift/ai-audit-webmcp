// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentDoors } from "../../src/client/components/AgentDoors";
import { askAgentPrompt, reviewPrompt } from "../../src/client/components/reviewPrompt";

const REPORT = "4a8a04c0-e247-4bec-a440-d9f3506f9212";

describe("beside the Context Engine, review it or ask it", () => {
  it("copies the prompt that reviews the model, and the one that asks it, each from its own button", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AgentDoors reportId={REPORT} />);
    expect(screen.getByText("Review the understanding with ChatGPT.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ask ChatGPT about this business/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(askAgentPrompt(REPORT)));
    expect(await screen.findByRole("button", { name: /Prompt copied/ })).toBeInTheDocument();
    // Where it goes is said at once: ChatGPT's Work mode, where the page's tools run.
    expect(screen.getByRole("status")).toHaveTextContent("In ChatGPT, switch to Work, then paste it");
    expect(screen.getByRole("link", { name: "Open ChatGPT" })).toHaveAttribute("href", "https://chatgpt.com/");
    expect(screen.getByText(/Needs a paid ChatGPT plan and its Work mode/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review with ChatGPT/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(reviewPrompt(REPORT)));
    expect(askAgentPrompt(REPORT)).toContain("inspect-business-model");
    // A browser that refuses the clipboard says so instead of doing nothing.
    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    // Still labelled as copied from the click before; it is the same review button.
    fireEvent.click(await screen.findByRole("button", { name: /Prompt copied/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be copied/);
    expect(reviewPrompt(REPORT)).toContain("inspect-business-model");
    expect(reviewPrompt(REPORT)).toContain("refine-terms-of-action");
    expect(reviewPrompt(REPORT)).toMatch(/never make an action work/);
  });
});
