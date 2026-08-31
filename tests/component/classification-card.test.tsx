// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClassificationCard } from "../../src/client/components/ClassificationCard";
import type { ClassificationResult } from "../../src/shared/types/index.js";

const classification: ClassificationResult = {
  primaryArchetype: "commerce-retail",
  categories: [{ name: "/Internet & Telecom/Web Services/Web Hosting & Domain Registration", confidence: 0.8 }],
  rankedArchetypes: [{ archetype: "commerce-retail", score: 3 }],
  confidence: "low",
  margin: 0.2,
  provisional: false,
  model: "google-v2",
  collectedAt: "2026-08-31T05:00:00.000Z",
};

function openAndSelect(archetype: string) {
  fireEvent.click(screen.getByRole("button", { name: /how we understood the site/i }));
  fireEvent.change(screen.getByLabelText(/correct the site type/i), { target: { value: archetype } });
  fireEvent.click(screen.getByRole("button", { name: /recompile map/i }));
}

describe("recompiling from the classification card", () => {
  it("hands the form back and says what went wrong when the recompile fails", async () => {
    render(
      <ClassificationCard
        classification={classification}
        onOverride={() => Promise.reject(new Error("That report has no observed evidence, so it cannot be recompiled."))}
      />,
    );
    openAndSelect("saas");

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be recompiled/);
    // The button must never stay stuck on "Recompiling…".
    await waitFor(() => expect(screen.getByRole("button", { name: /recompile map/i })).toBeEnabled());
  });

  it("re-enables the form after a recompile resolves", async () => {
    render(<ClassificationCard classification={classification} onOverride={() => Promise.resolve()} />);
    openAndSelect("saas");

    await waitFor(() => expect(screen.getByRole("button", { name: /recompile map/i })).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
