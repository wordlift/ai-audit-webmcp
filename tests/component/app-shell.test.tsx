// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/client/App";

describe("application shell", () => {
  it("leads with the action-first product thesis", () => {
    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /can ai agents understand and use your business/i })).toBeVisible();
    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.getByText(/audit it\. fix it\. activate it\./i)).toBeVisible();
    expect(screen.getByRole("button", { name: /audit my site/i })).toBeVisible();
  });
});
