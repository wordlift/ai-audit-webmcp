import { PlatformEgress } from "../../src/server/security/platformEgress.js";
import { VisitorClassifier } from "../../src/server/security/visitorClass.js";

const classifier = new VisitorClassifier({
  platforms: new PlatformEgress([{ platform: "anthropic", cidr: "160.79.104.0/21" }, { platform: "openai", cidr: "203.0.113.0/24" }]),
  crawlers: new PlatformEgress([{ platform: "google-crawlers", cidr: "66.249.64.0/19" }]),
});

describe("who is reading", () => {
  it.each([
    ["Googlebot from Google's range", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "66.249.66.1", "crawler:googlebot"],
    ["Googlebot from a home address", "Mozilla/5.0 (compatible; Googlebot/2.1)", "198.51.100.7", "crawler:claimed-googlebot"],
    ["Google-Extended from Google's range", "Google-Extended", "66.249.70.3", "crawler:google-extended"],
    ["GPTBot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", "198.51.100.7", "crawler:gptbot"],
    ["ChatGPT-User, even from OpenAI's egress", "ChatGPT-User/1.0", "203.0.113.9", "crawler:chatgpt-user"],
    ["ClaudeBot", "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "198.51.100.7", "crawler:claudebot"],
    ["Claude-User", "Claude-User/1.0", "160.79.105.7", "crawler:claude-user"],
    ["PerplexityBot", "Mozilla/5.0 (compatible; PerplexityBot/1.0)", "198.51.100.7", "crawler:perplexitybot"],
    ["some other bot", "Mozilla/5.0 (compatible; SomethingBot/3.0)", "198.51.100.7", "crawler:other"],
    ["an agent acting from Anthropic's egress", "Mozilla/5.0 (Macintosh)", "160.79.105.7", "agent:anthropic"],
    ["an agent acting from OpenAI's egress", "python-httpx/0.27", "203.0.113.9", "agent:openai"],
    ["a person", "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15", "198.51.100.7", "human"],
    ["no user agent at all", undefined, "198.51.100.7", "human"],
  ])("classifies %s", (_case, userAgent, ip, expected) => {
    expect(classifier.classify({ userAgent, ip })).toBe(expected);
  });

  it("treats every Googlebot as a claim when no ranges are known yet", () => {
    const early = new VisitorClassifier({});
    expect(early.classify({ userAgent: "Googlebot/2.1", ip: "66.249.66.1" })).toBe("crawler:claimed-googlebot");
  });
});
