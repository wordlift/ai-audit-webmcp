import { inferRelations } from "../../src/domain/context/inferRelations.js";
import type { SitePageSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";
import type { DomainEntity, EntityRelation } from "../../src/shared/types/index.js";

const PAGE = "https://alpina.travel/";

function page(text: string): SitePageSnapshot {
  return { url: PAGE, title: "Alpina", description: "", role: "entry", text, headings: [], linkPaths: [], linkLabels: [], forms: [], jsonLdTypes: [], entities: [], pageTools: [], truncated: false };
}

function entity(id: string, name: string, type: string, sourceUrls = [PAGE]): DomainEntity {
  return { id, name, types: [type], alternateNames: [], sourceUrls, sameAs: [], offers: [], confidence: 0.8 };
}

const org = entity("org", "AlpiNest Feriendorf", "LodgingBusiness");
const apt = entity("apt", "Samspitze 4", "Apartment");
const town = entity("town", "Mariapfarr", "Place");
const region = entity("region", "Lungau", "Place");
const said = (relations: EntityRelation[]) => relations.map((relation) => `${relation.from} ${relation.kind} ${relation.to}`);

describe("relations read from the text", () => {
  it("reads what a sentence says plainly between two things the graph holds, with the sentence as evidence", () => {
    const relations = inferRelations(
      [page("Welcome. AlpiNest Feriendorf offers Samspitze 4, a bright apartment. Samspitze 4 is located in Mariapfarr. Mariapfarr, in Lungau, is sunny. Samspitze 4, run by AlpiNest Feriendorf, sleeps four.")],
      [org, apt, town, region],
      [],
    );
    expect(said(relations)).toEqual(["org offers apt", "apt located-in town", "town located-in region", "apt provided-by org"]);
    expect(relations.every((relation) => relation.provenance === "inferred" && relation.sourceUrl === PAGE)).toBe(true);
    expect(relations[1]!.evidence).toBe("Samspitze 4 is located in Mariapfarr.");
  });

  it("reads nothing where the sentence says more between the names, or the roles cannot hold the kind", () => {
    const relations = inferRelations(
      [page("AlpiNest Feriendorf is proud to welcome guests to Samspitze 4. Mariapfarr offers Samspitze 4. Samspitze 4 and Mariapfarr are lovely. Visit Lungau in Mariapfarr's region, AlpiNest Feriendorf in winter.")],
      [org, apt, town, region],
      [],
    );
    expect(said(relations)).toEqual([]);
  });

  it("reads a page whose blocks arrived glued, a plain adjective, and an address, but not a list of places", () => {
    const tamsweg = entity("tamsweg", "Tamsweg", "Place");
    const relations = inferRelations(
      [page("One easy apartment base.IntroductionSamspitze 4 in sunny Mariapfarr, with a full kitchen. Two-bedroom apartment in Mariapfarr, Lungau, in the Alps. Day trips to Mariapfarr, Tamsweg and Lungau. Explore Lungau, Mariapfarr for the summer.")],
      [apt, town, region, tamsweg],
      [],
    );
    expect(said(relations)).toEqual(["apt located-in town", "town located-in region"]);
    expect(relations[0]!.evidence).toBe("IntroductionSamspitze 4 in sunny Mariapfarr, with a full kitchen.");
  });

  it("needs whole names, reads an entity found on another page of the site, and never repeats what the markup declares", () => {
    const elsewhere = entity("other", "Samspitze 5", "Apartment", ["https://alpina.travel/other/"]);
    const relations = inferRelations(
      [page("AlpiNest Feriendorf offers Samspitze 5. AlpiNest Feriendorf offers Samspitze 4. Samspitze 4 in Mariapfarrer Tal.")],
      [org, apt, town, elsewhere],
      [{ from: "org", to: "apt", kind: "offers", provenance: "declared", sourceUrl: PAGE }],
    );
    expect(said(relations)).toEqual(["org offers other"]);
  });
});
