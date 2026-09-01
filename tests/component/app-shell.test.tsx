// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/client/App";

describe("application shell", () => {
  it("leads with the action-first product thesis", () => {
    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /teach chatgpt how your business should work/i })).toBeVisible();
    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.getByText(/refine with chatgpt/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /audit and refine my site/i })).toBeVisible();
  });
});
