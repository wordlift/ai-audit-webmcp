// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { App } from "../../src/client/App";

describe("application shell", () => {
  it("leads with the action-first product thesis", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /agents need functions/i })).toBeVisible();
    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.getByText(/understand the site/i)).toBeVisible();
  });
});
