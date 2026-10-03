import type { DomainEntity } from "../types/index.js";

/**
 * One entity as the JSON-LD its page should carry: what the audit read, in the shape agents read.
 * The Fix panel shows one of these as a sample; Activate publishes the set.
 */
export function entityJsonLd(entity: DomainEntity): Record<string, unknown> {
  return {
    "@type": entity.types.length === 1 ? entity.types[0] : entity.types,
    "@id": entity.id,
    name: entity.name,
    ...(entity.description ? { description: entity.description } : {}),
    ...(entity.alternateNames.length > 0 ? { alternateName: entity.alternateNames } : {}),
    ...(entity.sourceUrls[0] ? { url: entity.sourceUrls[0] } : {}),
    ...(entity.sameAs.length > 0 ? { sameAs: entity.sameAs } : {}),
    ...(entity.offers.length > 0
      ? {
          offers: entity.offers.map((offer) => ({
            "@type": "Offer",
            ...(offer.name ? { name: offer.name } : {}),
            ...(offer.price !== undefined ? { price: offer.price } : {}),
            ...(offer.priceCurrency ? { priceCurrency: offer.priceCurrency } : {}),
            ...(offer.availability ? { availability: `https://schema.org/${offer.availability}` } : {}),
            ...(offer.url ? { url: offer.url } : {}),
          })),
        }
      : {}),
  };
}
