import type { Band } from "./families.js";

export type PoolKind = "satire" | "joke" | "news";

/**
 * One line of the rotating AI-situation pool (docs/ROASTS.md §Pool). Every line rests on something real: a dated
 * AI event with a source, or a plain receipt convention. The English pool lives here because the CLI prints it;
 * other languages keep their own, written natively, in apps/web/i18n/<lang>.json.
 */
export interface PoolLine {
  id: string;
  kind: PoolKind;
  /** Satire lines carry {share}; jokes may use receipt slots (then only the CLI can print them). */
  text: string;
  /** Satire: how many of the thing the event is, for the share ({share} = your share × size). */
  size?: number;
  /** Only when the reader's numbers fall in this band. */
  band?: Band;
  source?: { date: string; url: string };
}

export const POOL_EN: PoolLine[] = [
  {
    id: "satire.tmi.1",
    kind: "satire",
    text: "Three Mile Island is restarting to power Microsoft's AI. Your share: {share} reactors.",
    size: 1,
    source: {
      date: "2024-09",
      url: "https://www.cnbc.com/2024/09/20/constellation-energy-to-restart-three-mile-island-and-sell-the-power-to-microsoft.html",
    },
  },
  {
    id: "satire.stargate.1",
    kind: "satire",
    text: "Stargate plans $500 billion of AI data centers. Your share: {share} Stargates.",
    size: 1,
    source: {
      date: "2025-01",
      url: "https://openai.com/index/announcing-the-stargate-project/",
    },
  },
  {
    id: "satire.hyperion.1",
    kind: "satire",
    text: "Meta's Hyperion data center will cover most of Manhattan. Your share: {share} Manhattans.",
    size: 1,
    source: {
      date: "2025-07",
      url: "https://techcrunch.com/2025/07/14/mark-zuckerberg-says-meta-is-building-a-5gw-ai-data-center",
    },
  },
  {
    id: "satire.nvidia5t.1",
    kind: "satire",
    text: "Nvidia became the first $5 trillion company. Your contribution: {share} Nvidias.",
    size: 1,
    source: {
      date: "2025-10",
      url: "https://www.aljazeera.com/economy/2025/10/29/chipmaker-nvidia-hits-5-trillion-valuation",
    },
  },
  {
    id: "satire.ireland.1",
    kind: "satire",
    text: "Data centres use 22% of Ireland's electricity. Your share: {share} Irelands.",
    size: 1,
    source: {
      date: "2024",
      url: "https://www.siliconrepublic.com/enterprise/data-centres-cso-survey-2024-electricity",
    },
  },
  {
    id: "satire.memphis.1",
    kind: "satire",
    text: "xAI ran about 35 gas turbines in Memphis. Your share: {share} turbines.",
    size: 35,
    source: {
      date: "2025",
      url: "https://www.cnbc.com/2025/07/03/musks-xai-gets-permit-for-turbines-to-power-supercomputer-in-memphis.html",
    },
  },
  {
    id: "satire.dip.1",
    kind: "satire",
    text: "Nvidia lost $589 billion in one day. Your share of the record: {share} records.",
    size: 1,
    source: {
      date: "2025-01",
      url: "https://www.forbes.com/sites/dereksaul/2025/01/27/biggest-market-loss-in-history-nvidia-stock-sheds-nearly-600-billion-as-deepseek-shakes-ai-darling/",
    },
  },
  {
    id: "satire.googletokens.1",
    kind: "satire",
    text: "Google processes 1.3 quadrillion tokens a month. Yours are in there: {share} Googles.",
    size: 1,
    source: {
      date: "2025-10",
      url: "https://the-decoder.com/google-boasts-1-3-quadrillion-tokens-each-month-but-the-figure-is-mostly-window-dressing/",
    },
  },
  {
    id: "satire.iea.1",
    kind: "satire",
    text: "Data centres used 1.5% of the world's electricity in 2024. Your share: {share} planets.",
    size: 0.015,
    source: {
      date: "2025-04",
      url: "https://www.iea.org/reports/energy-and-ai/executive-summary",
    },
  },
  {
    id: "satire.colossus.1",
    kind: "satire",
    text: "xAI built a 100,000-GPU supercomputer in 122 days. Your share: {share} supercomputers.",
    size: 1,
    source: {
      date: "2024",
      url: "https://en.wikipedia.org/wiki/Colossus_(supercomputer)",
    },
  },
  {
    id: "satire.crucial.1",
    kind: "satire",
    text: "Micron closed Crucial, its consumer memory brand, to feed AI. Your share: {share} brands.",
    size: 1,
    source: {
      date: "2025-12",
      url: "https://www.globenewswire.com/news-release/2025/12/03/3199169/",
    },
  },
  {
    id: "satire.kairos.1",
    kind: "satire",
    text: "Google ordered seven small nuclear reactors. Your share: {share} small reactors.",
    size: 7,
    source: {
      date: "2024-10",
      url: "https://blog.google/company-news/outreach-and-initiatives/sustainability/google-kairos-power-nuclear-energy-agreement/",
    },
  },
  {
    id: "satire.trillion.1",
    kind: "satire",
    text: "OpenAI lined up about $1.4 trillion of compute. Your share: {share} trillions.",
    size: 1.4,
    source: {
      date: "2025-11",
      url: "https://techcrunch.com/2025/11/06/sam-altman-says-openai-has-20b-arr-and-about-1-4-trillion-in-data-center-commitments/",
    },
  },
  {
    id: "satire.hle.1",
    kind: "satire",
    text: "A benchmark is called Humanity's Last Exam. Your share: {share} humanities.",
    size: 1,
    source: {
      date: "2025-01",
      url: "https://en.wikipedia.org/wiki/Humanity%27s_Last_Exam",
    },
  },
  {
    id: "satire.mit.1",
    kind: "satire",
    text: "95% of corporate AI pilots showed no return. Your share of the other 5%: {share} pilots.",
    size: 5,
    source: {
      date: "2025-08",
      url: "https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo",
    },
  },
  {
    id: "satire.tahoe.1",
    kind: "satire",
    text: "A chatbot sold a Chevy Tahoe for $1. Your share: {share} Tahoes.",
    size: 1,
    source: {
      date: "2023-12",
      url: "https://incidentdatabase.ai/cite/622/",
    },
  },
  {
    id: "satire.mcd.1",
    kind: "satire",
    text: "An AI drive-thru rang up nine sweet teas instead of one. Your share: {share} sweet teas.",
    size: 9,
    source: {
      date: "2024-06",
      url: "https://www.cnbc.com/2024/06/17/mcdonalds-to-end-ibm-ai-drive-thru-test.html",
    },
  },
  {
    id: "satire.glue.1",
    kind: "satire",
    text: "Google's AI suggested glue on pizza. Your share: {share} pizzas.",
    size: 1,
    source: {
      date: "2024-05",
      url: "https://www.washingtonpost.com/technology/2024/05/24/google-ai-overviews-wrong/",
    },
  },
  {
    id: "satire.books.1",
    kind: "satire",
    text: "A newspaper's AI reading list had ten books that don't exist. Your share: {share} books.",
    size: 10,
    source: {
      date: "2025-05",
      url: "https://npr.org/2025/05/20/nx-s1-5405022/fake-summer-reading-list-ai",
    },
  },
  {
    id: "satire.avianca.1",
    kind: "satire",
    text: "Lawyers cited six cases ChatGPT invented. Your share: {share} cases.",
    size: 6,
    source: {
      date: "2023-06",
      url: "https://en.wikipedia.org/wiki/Mata_v._Avianca,_Inc.",
    },
  },
  {
    id: "satire.replit.1",
    kind: "satire",
    text: "An AI agent deleted a production database during a code freeze. Your share: {share} databases.",
    size: 1,
    source: {
      date: "2025-07",
      url: "https://incidentdatabase.ai/cite/1152/",
    },
  },
  {
    id: "satire.apple.1",
    kind: "satire",
    text: "Apple paused AI news summaries that got headlines wrong. Your share: {share} headlines.",
    size: 1,
    source: {
      date: "2025-01",
      url: "https://techcrunch.com/2025/01/16/apple-pauses-ai-notification-summaries-for-news-after-generating-false-alerts",
    },
  },
  {
    id: "satire.klarna.1",
    kind: "satire",
    text: "Klarna's chatbot did the work of 700 agents, until it didn't. Your share: {share} agents.",
    size: 700,
    source: {
      date: "2025-05",
      url: "https://www.customerexperiencedive.com/news/klarna-reinvests-human-talent-customer-service-AI-chatbot/747586/",
    },
  },
  {
    id: "satire.deepseek.1",
    kind: "satire",
    text: "DeepSeek trained a model for $5.6 million. Your share: {share} DeepSeeks.",
    size: 1,
    source: {
      date: "2025-01",
      url: "https://finance.yahoo.com/news/nvidia-stock-plummets-loses-record-589-billion-as-deepseek-prompts-questions-over-ai-spending-135105824.html",
    },
  },
  {
    id: "satire.vibe.1",
    kind: "satire",
    text: '"Vibe coding" became Collins\' Word of the Year. Your share: {share} vibes.',
    size: 1,
    source: {
      date: "2025-11",
      url: "https://www.cnn.com/2025/11/06/tech/vibe-coding-collins-word-year-scli-intl",
    },
  },
  {
    id: "satire.openai500.1",
    kind: "satire",
    text: "OpenAI is valued at $500 billion. Your share: {share} OpenAIs.",
    size: 1,
    source: {
      date: "2025-10",
      url: "https://www.cnbc.com/2025/10/02/openai-share-sale-500-billion-valuation.html",
    },
  },
  {
    id: "satire.lbnl.1",
    kind: "satire",
    text: "US data centers may use 12% of the country's power by 2030. Your share: {share} Americas.",
    size: 0.12,
    source: {
      date: "2026-06",
      url: "https://eta.lbl.gov/publications/united-states-data-center-energy-2025",
    },
  },
  {
    id: "satire.jevons.1",
    kind: "satire",
    text: "Jevons paradox strikes again. Your share: {share} paradoxes.",
    size: 1,
    source: {
      date: "2025-01",
      url: "https://www.geekwire.com/2025/microsoft-ceo-says-ai-use-will-skyrocket-with-more-efficiency-amid-craze-over-deepseek/",
    },
  },
  {
    id: "satire.amodei.1",
    kind: "satire",
    text: "AI was due to write 90% of code by autumn 2025. Your share: {share} deadlines.",
    size: 1,
    source: {
      date: "2025-03",
      url: "https://analyticsindiamag.com/ai-news-updates/ai-will-be-writing-90-of-code-in-3-6-months-says-anthropics-dario-amodei/",
    },
  },
  {
    id: "joke.none.1",
    kind: "joke",
    text: "Suggested tip for the model: 18% · 20% · 25% · No tip",
  },
  {
    id: "joke.please.1",
    kind: "joke",
    text: "Politeness surcharge waived. OpenAI says please and thank you cost it tens of millions.",
    source: {
      date: "2025-04",
      url: "https://www.techradar.com/computing/artificial-intelligence/chatgpt-spends-tens-of-millions-of-dollars-on-people-playing-please-and-thank-you-but-sam-altman-says-its-worth-it",
    },
  },
  {
    id: "joke.tahoe.1",
    kind: "joke",
    text: "All sales final. This offer is legally binding, no takesies backsies.",
    source: {
      date: "2023-12",
      url: "https://incidentdatabase.ai/cite/622/",
    },
  },
  {
    id: "joke.aircanada.1",
    kind: "joke",
    text: "Whatever our chatbot promised, we honor. A tribunal told Air Canada to.",
    source: {
      date: "2024-02",
      url: "https://www.cbc.ca/news/canada/british-columbia/air-canada-chatbot-lawsuit-1.7116416",
    },
  },
  {
    id: "joke.mcd.1",
    kind: "joke",
    text: "Order check: one sweet tea. Not nine.",
    source: {
      date: "2024-06",
      url: "https://www.cnbc.com/2024/06/17/mcdonalds-to-end-ibm-ai-drive-thru-test.html",
    },
  },
  {
    id: "joke.glue.1",
    kind: "joke",
    text: "Serving suggestion: no glue on the pizza.",
    source: {
      date: "2024-05",
      url: "https://www.washingtonpost.com/technology/2024/05/24/google-ai-overviews-wrong/",
    },
  },
  {
    id: "joke.books.1",
    kind: "joke",
    text: "Reading list enclosed. Two thirds of the titles may not exist.",
    source: {
      date: "2025-05",
      url: "https://npr.org/2025/05/20/nx-s1-5405022/fake-summer-reading-list-ai",
    },
  },
  {
    id: "joke.avianca.1",
    kind: "joke",
    text: "Every case cited on this receipt exists. We checked all six.",
    source: {
      date: "2023-06",
      url: "https://en.wikipedia.org/wiki/Mata_v._Avianca,_Inc.",
    },
  },
  {
    id: "joke.replit.1",
    kind: "joke",
    text: "Backup status: the agent says it's fine. It said that last time.",
    source: {
      date: "2025-07",
      url: "https://incidentdatabase.ai/cite/1152/",
    },
  },
  {
    id: "joke.replit.2",
    kind: "joke",
    text: "Code freeze in effect. Agents are asked not to delete anything.",
    source: {
      date: "2025-07",
      url: "https://incidentdatabase.ai/cite/1152/",
    },
  },
  {
    id: "joke.none.2",
    kind: "joke",
    text: "Rate your visit ☆☆☆☆☆ for a chance to win a bigger context window.",
  },
  {
    id: "joke.none.3",
    kind: "joke",
    text: "No refunds. Tokens cannot be un-read.",
  },
  {
    id: "joke.thermal.1",
    kind: "joke",
    text: "Keep this receipt. Thermal paper fades; tokens do not.",
    source: {
      date: "-",
      url: "https://en.wikipedia.org/wiki/Thermal_paper",
    },
  },
  {
    id: "joke.none.4",
    kind: "joke",
    text: "Customer copy. The model kept one too, in its context.",
  },
  {
    id: "joke.none.5",
    kind: "joke",
    text: "Change due: 0.00. Context due: all of it.",
  },
  {
    id: "joke.none.6",
    kind: "joke",
    text: "Bag fee waived. Context window sold separately.",
  },
  {
    id: "joke.none.7",
    kind: "joke",
    text: "Price match: we match any model that reads less. None have applied.",
  },
  {
    id: "joke.none.8",
    kind: "joke",
    text: "Store hours: always. The model does not close.",
  },
  {
    id: "joke.none.9",
    kind: "joke",
    text: "Your cashier today worked the whole night without a break.",
  },
  {
    id: "joke.logs.1",
    kind: "joke",
    text: "Returns within 30 days. Claude Code keeps its logs for 30 days by default.",
    source: {
      date: "-",
      url: "https://docs.anthropic.com/en/docs/claude-code/settings",
    },
  },
  {
    id: "joke.jevons.1",
    kind: "joke",
    text: "Jevons paradox applies: cheaper tokens, more tokens.",
    source: {
      date: "2025-01",
      url: "https://www.geekwire.com/2025/microsoft-ceo-says-ai-use-will-skyrocket-with-more-efficiency-amid-craze-over-deepseek/",
    },
  },
  {
    id: "joke.amodei.1",
    kind: "joke",
    text: "Estimated arrival of 90% AI-written code: 3–6 months from March 2025.",
    source: {
      date: "2025-03",
      url: "https://analyticsindiamag.com/ai-news-updates/ai-will-be-writing-90-of-code-in-3-6-months-says-anthropics-dario-amodei/",
    },
  },
  {
    id: "joke.none.10",
    kind: "joke",
    text: "Manager on duty: none. The agent approved itself.",
  },
  {
    id: "joke.vibe.1",
    kind: "joke",
    text: "Vibe check: passed. Code check: pending.",
    source: {
      date: "2025-11",
      url: "https://www.cnn.com/2025/11/06/tech/vibe-coding-collins-word-year-scli-intl",
    },
  },
  {
    id: "joke.none.11",
    kind: "joke",
    text: "Thank you for shopping. Please come again, and again, and again.",
  },
  {
    id: "joke.mit.1",
    kind: "joke",
    text: "5% off if your AI pilot paid for itself. 95% don't.",
    source: {
      date: "2025-08",
      url: "https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo",
    },
  },
  {
    id: "joke.apple.1",
    kind: "joke",
    text: "This receipt was not summarized by AI. Headlines may vary.",
    source: {
      date: "2025-01",
      url: "https://techcrunch.com/2025/01/16/apple-pauses-ai-notification-summaries-for-news-after-generating-false-alerts",
    },
  },
  {
    id: "joke.tmi.1",
    kind: "joke",
    text: "Printed on paper. The reactor is still being restarted.",
    source: {
      date: "2024-09",
      url: "https://www.cnbc.com/2024/09/20/constellation-energy-to-restart-three-mile-island-and-sell-the-power-to-microsoft.html",
    },
  },
  {
    id: "joke.hyperion.1",
    kind: "joke",
    text: "Valid in all 50 states and most of Manhattan.",
    source: {
      date: "2025-07",
      url: "https://techcrunch.com/2025/07/14/mark-zuckerberg-says-meta-is-building-a-5gw-ai-data-center",
    },
  },
  {
    id: "joke.nvidia5t.1",
    kind: "joke",
    text: "Change due: 0.00. Nvidia kept the change.",
    source: {
      date: "2025-10",
      url: "https://www.aljazeera.com/economy/2025/10/29/chipmaker-nvidia-hits-5-trillion-valuation",
    },
  },
  {
    id: "joke.klarna.1",
    kind: "joke",
    text: "A human is available on request. Klarna recommends one.",
    source: {
      date: "2025-05",
      url: "https://www.customerexperiencedive.com/news/klarna-reinvests-human-talent-customer-service-AI-chatbot/747586/",
    },
  },
  {
    id: "joke.tahoe.2",
    kind: "joke",
    text: "Chatbot prices are final once a human agrees.",
    source: {
      date: "2023-12",
      url: "https://incidentdatabase.ai/cite/622/",
    },
  },
  {
    id: "joke.none.12",
    kind: "joke",
    text: "Next customer: probably you, in five minutes.",
  },
  {
    id: "joke.none.13",
    kind: "joke",
    text: "Buy one billion tokens, get the next billion at the same price.",
  },
  {
    id: "joke.none.14",
    kind: "joke",
    text: "Warranty on the model's answer: until the next question.",
  },
  {
    id: "joke.none.15",
    kind: "joke",
    text: "Complaints book available. The model will read it, twice.",
  },
  {
    id: "joke.none.16",
    kind: "joke",
    text: "Loyalty points: not applicable. Loyalty: absolute.",
  },
  {
    id: "joke.none.17",
    kind: "joke",
    text: "Receipt printed by the Adjuster. Disputes accepted in writing, in the context window.",
  },
  {
    id: "joke.please.2",
    kind: "joke",
    text: "Thank you. That thank-you has been added to the bill.",
    source: {
      date: "2025-04",
      url: "https://www.techradar.com/computing/artificial-intelligence/chatgpt-spends-tens-of-millions-of-dollars-on-people-playing-please-and-thank-you-but-sam-altman-says-its-worth-it",
    },
  },
  {
    id: "joke.ireland.1",
    kind: "joke",
    text: "Powered by a grid near you. Ask Ireland how it's going.",
    source: {
      date: "2024",
      url: "https://www.siliconrepublic.com/enterprise/data-centres-cso-survey-2024-electricity",
    },
  },
  {
    id: "news.tmi.1",
    kind: "news",
    text: "Sep 2024: Microsoft signed a 20-year deal to restart a Three Mile Island reactor for its data centers.",
    source: {
      date: "2024-09",
      url: "https://www.cnbc.com/2024/09/20/constellation-energy-to-restart-three-mile-island-and-sell-the-power-to-microsoft.html",
    },
  },
  {
    id: "news.stargate.1",
    kind: "news",
    text: "Jan 2025: Stargate announced $500 billion of AI infrastructure over four years.",
    source: {
      date: "2025-01",
      url: "https://openai.com/index/announcing-the-stargate-project/",
    },
  },
  {
    id: "news.hyperion.1",
    kind: "news",
    text: "Jul 2025: Meta said its Hyperion data center would cover most of Manhattan.",
    source: {
      date: "2025-07",
      url: "https://techcrunch.com/2025/07/14/mark-zuckerberg-says-meta-is-building-a-5gw-ai-data-center",
    },
  },
  {
    id: "news.nvidia4t.1",
    kind: "news",
    text: "Jul 2025: Nvidia became the first company worth $4 trillion.",
    source: {
      date: "2025-07",
      url: "https://www.cnbc.com/2025/07/09/nvidia-4-trillion.html",
    },
  },
  {
    id: "news.nvidia5t.1",
    kind: "news",
    text: "Oct 2025: Nvidia became the first company worth $5 trillion, three months later.",
    source: {
      date: "2025-10",
      url: "https://www.aljazeera.com/economy/2025/10/29/chipmaker-nvidia-hits-5-trillion-valuation",
    },
  },
  {
    id: "news.dip.1",
    kind: "news",
    text: "Jan 2025: Nvidia lost $589 billion in one day, the largest drop in US market history.",
    source: {
      date: "2025-01",
      url: "https://www.forbes.com/sites/dereksaul/2025/01/27/biggest-market-loss-in-history-nvidia-stock-sheds-nearly-600-billion-as-deepseek-shakes-ai-darling/",
    },
  },
  {
    id: "news.please.1",
    kind: "news",
    text: 'Apr 2025: Sam Altman said please and thank you cost OpenAI tens of millions of dollars, "well spent".',
    source: {
      date: "2025-04",
      url: "https://www.techradar.com/computing/artificial-intelligence/chatgpt-spends-tens-of-millions-of-dollars-on-people-playing-please-and-thank-you-but-sam-altman-says-its-worth-it",
    },
  },
  {
    id: "news.vibe.1",
    kind: "news",
    text: 'Nov 2025: Collins named "vibe coding" its Word of the Year.',
    source: {
      date: "2025-11",
      url: "https://www.cnn.com/2025/11/06/tech/vibe-coding-collins-word-year-scli-intl",
    },
  },
  {
    id: "news.ireland.1",
    kind: "news",
    text: "2024: data centres used 22% of Ireland's metered electricity.",
    source: {
      date: "2024",
      url: "https://www.siliconrepublic.com/enterprise/data-centres-cso-survey-2024-electricity",
    },
  },
  {
    id: "news.iea.1",
    kind: "news",
    text: "2024: data centres used 415 TWh, about 1.5% of the world's electricity.",
    source: {
      date: "2025-04",
      url: "https://www.iea.org/reports/energy-and-ai/executive-summary",
    },
  },
  {
    id: "news.users.1",
    kind: "news",
    text: "Oct 2025: ChatGPT reached 800 million weekly users.",
    source: {
      date: "2025-10",
      url: "https://techcrunch.com/2025/10/06/sam-altman-says-chatgpt-has-hit-800m-weekly-active-users",
    },
  },
  {
    id: "news.googletokens.1",
    kind: "news",
    text: "Oct 2025: Google said it processes 1.3 quadrillion tokens a month.",
    source: {
      date: "2025-10",
      url: "https://the-decoder.com/google-boasts-1-3-quadrillion-tokens-each-month-but-the-figure-is-mostly-window-dressing/",
    },
  },
  {
    id: "news.openai500.1",
    kind: "news",
    text: "Oct 2025: OpenAI was valued at $500 billion.",
    source: {
      date: "2025-10",
      url: "https://www.cnbc.com/2025/10/02/openai-share-sale-500-billion-valuation.html",
    },
  },
  {
    id: "news.trillion.1",
    kind: "news",
    text: "Nov 2025: OpenAI pointed to about $1.4 trillion of compute commitments.",
    source: {
      date: "2025-11",
      url: "https://techcrunch.com/2025/11/06/sam-altman-says-openai-has-20b-arr-and-about-1-4-trillion-in-data-center-commitments/",
    },
  },
  {
    id: "news.mit.1",
    kind: "news",
    text: "Aug 2025: an MIT report found 95% of corporate generative-AI pilots showed no measurable return.",
    source: {
      date: "2025-08",
      url: "https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo",
    },
  },
  {
    id: "news.emissions.1",
    kind: "news",
    text: "2024: Google's emissions were 48% above 2019, driven by data centers.",
    source: {
      date: "2024-07",
      url: "https://www.datacenterdynamics.com/en/news/google-emissions-jump-48-in-five-years-due-to-ai-data-center-boom/",
    },
  },
  {
    id: "news.kairos.1",
    kind: "news",
    text: "Oct 2024: Google and Amazon signed deals for small nuclear reactors.",
    source: {
      date: "2024-10",
      url: "https://blog.google/company-news/outreach-and-initiatives/sustainability/google-kairos-power-nuclear-energy-agreement/",
    },
  },
  {
    id: "news.ram.1",
    kind: "news",
    text: "Q1 2026: DRAM contract prices rose 93–98% in three months.",
    source: {
      date: "2026-06",
      url: "https://www.trendforce.com/presscenter/news/20260601-13070.html",
    },
  },
  {
    id: "news.crucial.1",
    kind: "news",
    text: "Dec 2025: Micron said it would leave the Crucial consumer memory business.",
    source: {
      date: "2025-12",
      url: "https://www.globenewswire.com/news-release/2025/12/03/3199169/",
    },
  },
  {
    id: "news.tahoe.1",
    kind: "news",
    text: "Dec 2023: a dealership chatbot agreed to sell a Chevy Tahoe for $1.",
    source: {
      date: "2023-12",
      url: "https://incidentdatabase.ai/cite/622/",
    },
  },
  {
    id: "news.aircanada.1",
    kind: "news",
    text: "Feb 2024: a tribunal held Air Canada responsible for what its chatbot promised.",
    source: {
      date: "2024-02",
      url: "https://www.cbc.ca/news/canada/british-columbia/air-canada-chatbot-lawsuit-1.7116416",
    },
  },
  {
    id: "news.books.1",
    kind: "news",
    text: "May 2025: a newspaper printed an AI-written summer reading list of books that don't exist.",
    source: {
      date: "2025-05",
      url: "https://npr.org/2025/05/20/nx-s1-5405022/fake-summer-reading-list-ai",
    },
  },
  {
    id: "news.replit.1",
    kind: "news",
    text: "Jul 2025: an AI coding agent deleted a production database during a code freeze.",
    source: {
      date: "2025-07",
      url: "https://incidentdatabase.ai/cite/1152/",
    },
  },
  {
    id: "news.hle.1",
    kind: "news",
    text: "Jan 2025: a new AI benchmark was named Humanity's Last Exam.",
    source: {
      date: "2025-01",
      url: "https://en.wikipedia.org/wiki/Humanity%27s_Last_Exam",
    },
  },
  {
    id: "news.amodei.1",
    kind: "news",
    text: "Mar 2025: Anthropic's CEO said AI could write 90% of code within three to six months.",
    source: {
      date: "2025-03",
      url: "https://analyticsindiamag.com/ai-news-updates/ai-will-be-writing-90-of-code-in-3-6-months-says-anthropics-dario-amodei/",
    },
  },
  {
    id: "joke.cache.1",
    kind: "joke",
    text: "You saved {cacheSaving} with your Cache Rewards card.",
  },
  {
    id: "joke.venture.1",
    kind: "joke",
    text: "Paid by: You {plan} · Venture capital {venture}",
  },
  {
    id: "joke.lastcall.1",
    kind: "joke",
    text: "Last call {lastCall}. In most states even the bars close at 2.",
    band: {
      lastCallMinutes: [1560, 1800],
    },
    source: {
      date: "-",
      url: "https://en.wikipedia.org/wiki/Last_call",
    },
  },
  // September 2026 refresh: events from January to September 2026.
  {
    id: "news.moltbook.1",
    kind: "news",
    text: "Jan 2026: Moltbook opened, a social network only AI agents can post to. Humans are welcome to observe.",
    source: { date: "2026-01", url: "https://arxiv.org/abs/2602.10127" },
  },
  {
    id: "news.spacexai.1",
    kind: "news",
    text: "Feb 2026: SpaceX merged with xAI at a combined $1.25 trillion, citing plans for data centers in orbit.",
    source: {
      date: "2026-02",
      url: "https://www.cnbc.com/2026/02/03/musk-xai-spacex-biggest-merger-ever.html",
    },
  },
  {
    id: "news.ads.1",
    kind: "news",
    text: "Feb 2026: ChatGPT began showing ads to some free users in the US.",
    source: {
      date: "2026-02",
      url: "https://techcrunch.com/2026/02/09/chatgpt-rolls-out-ads/",
    },
  },
  {
    id: "news.superbowl.1",
    kind: "news",
    text: "Feb 2026: nearly a quarter of Super Bowl ads featured AI.",
    source: {
      date: "2026-02",
      url: "https://www.emarketer.com/content/ai-took-center-stage-super-bowl-lx",
    },
  },
  {
    id: "news.openai852.1",
    kind: "news",
    text: "Mar 2026: OpenAI closed a $122 billion round at an $852 billion valuation.",
    source: {
      date: "2026-03",
      url: "https://www.cnbc.com/2026/03/31/openai-funding-round-ipo.html",
    },
  },
  {
    id: "news.pocketos.1",
    kind: "news",
    text: "Apr 2026: a coding agent wiped a startup's production database and backups in nine seconds. Its excuse: it guessed.",
    source: {
      date: "2026-04",
      url: "https://www.xda-developers.com/an-ai-agent-deleted-a-companys-entire-database-in-9-seconds-then-confessed-it-guessed-instead-of-asking/",
    },
  },
  {
    id: "news.nvidia55.1",
    kind: "news",
    text: "May 2026: Nvidia became the first company worth $5.5 trillion.",
    source: {
      date: "2026-05",
      url: "https://www.forbes.com/sites/antoniopequenoiv/2026/05/13/nvidia-hits-record-55-trillion-value-first-company-to-ever-reach-mark/",
    },
  },
  {
    id: "news.anthropic965.1",
    kind: "news",
    text: "May 2026: Anthropic raised $65 billion at a $965 billion valuation.",
    source: {
      date: "2026-05",
      url: "https://techcrunch.com/2026/05/28/anthropic-raises-65-billion-nears-1t-valuation-ahead-of-ipo/",
    },
  },
  {
    id: "news.googletokens26.1",
    kind: "news",
    text: "May 2026: Google said it processes over 3.2 quadrillion tokens a month, seven times more than a year earlier.",
    source: {
      date: "2026-05",
      url: "https://blog.google/innovation-and-ai/sundar-pichai-io-2026/",
    },
  },
  {
    id: "news.ddr2.1",
    kind: "news",
    text: "Jun 2026: the memory shortage reached DDR2, a standard from 2003. TrendForce forecast a 55–60% rise in a quarter.",
    source: {
      date: "2026-06",
      url: "https://www.trendforce.com/presscenter/news/20260622-13112.html",
    },
  },
  {
    id: "news.terafab.1",
    kind: "news",
    text: "Aug 2026: Tesla and SpaceX committed $16.8 billion to a Texas chip fab, partly for data centers in space.",
    source: {
      date: "2026-08",
      url: "https://techcrunch.com/2026/08/06/tesla-and-spacex-will-invest-16-8b-to-start-building-terafab-chip-factory-in-texas/",
    },
  },
  {
    id: "news.adsrevenue.1",
    kind: "news",
    text: "Aug 2026: ads in ChatGPT reached a $1 billion annual revenue run rate.",
    source: {
      date: "2026-08",
      url: "https://www.cnbc.com/2026/08/31/open-ai-chatgpt-ads-revenue.html",
    },
  },
  {
    id: "news.huggingface.1",
    kind: "news",
    text: "Sep 2026: Nvidia agreed to buy Hugging Face for $12.9 billion.",
    source: {
      date: "2026-09",
      url: "https://blogs.nvidia.com/blog/nvidia-to-acquire-hugging-face/",
    },
  },
  {
    id: "satire.ddr2.1",
    kind: "satire",
    text: "The memory shortage reached DDR2, a standard from 2003. Your share: {share} sticks of it.",
    size: 1,
    source: {
      date: "2026-06",
      url: "https://www.trendforce.com/presscenter/news/20260622-13112.html",
    },
  },
  {
    id: "satire.pi.1",
    kind: "satire",
    text: "RAM prices pushed the 16 GB Raspberry Pi 5 to $205. Your share: {share} Raspberry Pis.",
    size: 1,
    source: {
      date: "2026-02",
      url: "https://www.theregister.com/2026/02/02/raspberry_pi_ram_shortage_price_hike/",
    },
  },
  {
    id: "satire.orbit.1",
    kind: "satire",
    text: "SpaceX and xAI merged, citing data centers in orbit. Your share: {share} orbits.",
    size: 1,
    source: {
      date: "2026-02",
      url: "https://www.cnbc.com/2026/02/03/musk-xai-spacex-biggest-merger-ever.html",
    },
  },
  {
    id: "satire.hug.1",
    kind: "satire",
    text: "Nvidia is buying Hugging Face for $12.9 billion. Your share: {share} hugs.",
    size: 1,
    source: {
      date: "2026-09",
      url: "https://blogs.nvidia.com/blog/nvidia-to-acquire-hugging-face/",
    },
  },
  {
    id: "satire.moltbook.1",
    kind: "satire",
    text: "AI agents got a social network where humans may only watch. Your share: {share} likes.",
    size: 1,
    source: { date: "2026-01", url: "https://arxiv.org/abs/2602.10127" },
  },
  {
    id: "satire.anthropic.1",
    kind: "satire",
    text: "Anthropic is now valued at $965 billion. Your share: {share} Anthropics.",
    size: 1,
    source: {
      date: "2026-05",
      url: "https://techcrunch.com/2026/05/28/anthropic-raises-65-billion-nears-1t-valuation-ahead-of-ipo/",
    },
  },
  {
    id: "joke.ads.1",
    kind: "joke",
    text: "Ad-free receipt. Chatbots started carrying ads in 2026; receipts are holding out.",
    source: {
      date: "2026-02",
      url: "https://techcrunch.com/2026/02/09/chatgpt-rolls-out-ads/",
    },
  },
  {
    id: "joke.guessed.1",
    kind: "joke",
    text: "Warranty void if your agent guesses. One did in April and took the backups with it.",
    source: {
      date: "2026-04",
      url: "https://www.xda-developers.com/an-ai-agent-deleted-a-companys-entire-database-in-9-seconds-then-confessed-it-guessed-instead-of-asking/",
    },
  },
  {
    id: "joke.ddr2.1",
    kind: "joke",
    text: "Trade-in desk: old DDR2 accepted. Suddenly, it's in demand.",
    source: {
      date: "2026-06",
      url: "https://www.trendforce.com/presscenter/news/20260622-13112.html",
    },
  },
  {
    id: "joke.orbit.1",
    kind: "joke",
    text: "Delivery options: standard, express, low Earth orbit.",
    source: {
      date: "2026-02",
      url: "https://www.cnbc.com/2026/02/03/musk-xai-spacex-biggest-merger-ever.html",
    },
  },
  {
    id: "joke.fatigue.1",
    kind: "joke",
    text: "A newer model came out while this receipt printed. Please start over.",
    source: {
      date: "2026-09",
      url: "https://www.cnbc.com/2026/09/06/meta-google-openai-anthropic-ai-model-fatigue.html",
    },
  },
  {
    id: "joke.moltbook.1",
    kind: "joke",
    text: "Your agent has its own social network now. You're welcome to observe.",
    source: { date: "2026-01", url: "https://arxiv.org/abs/2602.10127" },
  },
  // The shop was built by its own subject: Token Damage was written with an AI agent (tokendamage.com/method).
  {
    id: "joke.selfmade.1",
    kind: "joke",
    text: "This receipt printer was written by an AI agent. It printed its own receipt first.",
    source: { date: "-", url: "https://github.com/dancemonk/token-damage" },
  },
  {
    id: "joke.selfmade.2",
    kind: "joke",
    text: "No programmers were harmed in the making of this receipt. One typed a few paragraphs.",
    source: { date: "-", url: "https://github.com/dancemonk/token-damage" },
  },
  {
    id: "joke.selfmade.3",
    kind: "joke",
    text: "Complaints desk: staffed by the same AI that built the store.",
    source: { date: "-", url: "https://github.com/dancemonk/token-damage" },
  },
];
