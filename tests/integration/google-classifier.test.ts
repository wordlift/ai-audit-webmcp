import { GoogleNlpClassifier, normalizeCategories } from "../../src/server/adapters/classify/GoogleNlp.js";

const pageText = Array.from({ length: 60 }, (_, index) => `alpine holiday apartment lungau word${index}`).join(" ");

describe("Google Natural Language classifier", () => {
  it("requests the V2 category model and stores exact category strings", async () => {
    const classifyText = vi.fn(async (_request: unknown): Promise<[{ categories: Array<{ name: string; confidence: number }> }]> => [
      {
        categories: [
          { name: "/Travel & Transportation/Hotels & Accommodations", confidence: 0.92 },
          { name: "/Travel & Transportation", confidence: 0.55 },
        ],
      },
    ]);

    const outcome = await new GoogleNlpClassifier({ client: { classifyText } }).classify({
      text: pageText,
      url: "https://alpina.travel/",
    });

    const request = classifyText.mock.calls[0]?.[0] as { classificationModelOptions: { v2Model: { contentCategoriesVersion: string } } };
    expect(request.classificationModelOptions.v2Model.contentCategoriesVersion).toBe("V2");
    expect(outcome.model).toBe("google-natural-language-v2");
    expect(outcome.categories[0]).toEqual({ name: "/Travel & Transportation/Hotels & Accommodations", confidence: 0.92 });
    expect(outcome.failureReason).toBeUndefined();
  });

  it("degrades to behavior-only inference when Google fails", async () => {
    const classifyText = vi.fn(async (_request: unknown): Promise<[{ categories: [] }]> => {
      throw Object.assign(new Error("permission denied"), { code: 7 });
    });

    const outcome = await new GoogleNlpClassifier({ client: { classifyText } }).classify({
      text: pageText,
      url: "https://alpina.travel/",
    });

    expect(outcome.categories).toEqual([]);
    expect(outcome.failureReason).toMatch(/inferred from site behavior only/);
  });

  it("does not call Google for a page with too little text", async () => {
    const classifyText = vi.fn();
    const outcome = await new GoogleNlpClassifier({ client: { classifyText } }).classify({
      text: "Short page.",
      url: "https://alpina.travel/",
    });

    expect(classifyText).not.toHaveBeenCalled();
    expect(outcome.failureReason).toMatch(/not contain enough readable text/);
  });

  it("orders categories deterministically and clamps confidence", () => {
    expect(
      normalizeCategories([
        { name: "/Travel", confidence: 0.4 },
        { name: "/Shopping", confidence: 1.4 },
        { name: "/Arts", confidence: 0.4 },
        { name: "", confidence: 0.9 },
      ]),
    ).toEqual([
      { name: "/Shopping", confidence: 1 },
      { name: "/Arts", confidence: 0.4 },
      { name: "/Travel", confidence: 0.4 },
    ]);
  });
});
