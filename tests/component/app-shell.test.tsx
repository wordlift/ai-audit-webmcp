// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/client/App";

describe("application shell", () => {
  it("leads with the action-first product thesis", () => {
    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /agents need a service map/i })).toBeVisible();
    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.getByText(/extract entities & meaning/i)).toBeVisible();
  });
});
