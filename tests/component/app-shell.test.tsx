// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/client/App";

describe("application shell", () => {
  it("leads with one job: a URL in, a model of the business out", () => {
    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /your business, as ai agents read it/i })).toBeVisible();
    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.getByText(/checks what AI agents can actually do with it/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /audit my site/i })).toBeVisible();
  });
});
