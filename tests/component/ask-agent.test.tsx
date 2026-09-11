// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AskAgentStrip } from "../../src/client/components/AskAgentStrip";
import { askAgentPrompt } from "../../src/client/components/reviewPrompt";

describe("try the model with an AI agent", () => {
  it("copies a prompt that opens this report and reads the business model, keeping provenance apart", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AskAgentStrip reportId="4a8a04c0-e247-4bec-a440-d9f3506f9212" />);
    fireEvent.click(screen.getByRole("button", { name: /Ask ChatGPT about this business/ }));
    const prompt = askAgentPrompt("4a8a04c0-e247-4bec-a440-d9f3506f9212");
    expect(writeText).toHaveBeenCalledWith(prompt);
    expect(prompt).toContain("/reports/4a8a04c0-e247-4bec-a440-d9f3506f9212");
    expect(prompt).toContain("inspect-business-model");
    expect(prompt).toMatch(/declared, inferred and verified/);
    expect(await screen.findByRole("button", { name: /Prompt copied/ })).toBeInTheDocument();
  });
});
