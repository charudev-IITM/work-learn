import {
  Zap,
  BarChart3,
  ArrowLeftRight,
  GripVertical,
  Bell,
  Shield,
  Smartphone,
  RefreshCw,
  Eye,
  Calculator,
  Layers,
  Newspaper,
  MapPin,
  TrendingUp,
  Bot,
  type LucideIcon,
} from "lucide-react";

export interface FeatureBenefit {
  title: string;
  description: string;
}

export interface FeatureDetail {
  slug: string;
  icon: LucideIcon;
  title: string;
  tag: string;
  headline: string;
  subheadline: string;
  description: string;
  benefits: FeatureBenefit[];
  howItWorks: string[];
  relatedSlugs: string[];
}

export const featureDetails: FeatureDetail[] = [
  {
    slug: "real-time-updates",
    icon: Zap,
    title: "Sub-Second Updates",
    tag: "Performance",
    headline: "Rates That Move as Fast as the Market",
    subheadline:
      "While others refresh every 30 seconds, SpotCompare delivers price changes in under one second — giving you a real edge.",
    description:
      "SpotCompare's real-time infrastructure connects directly to dealer rate feeds and pushes every price change to your screen instantly. There's no manual refresh, no 30-second delay. When a dealer updates their rate, you see it right away. In fast-moving bullion markets, the difference between a 1-second update and a 30-second update can mean the difference between catching a price dip and missing it entirely.",
    benefits: [
      {
        title: "Always Connected",
        description:
          "Persistent connections push data to you the instant it changes — no delays.",
      },
      {
        title: "Zero Manual Refresh",
        description:
          "Prices update automatically. No button clicking, no page reloading, no interruptions.",
      },
      {
        title: "Stale Data Detection",
        description:
          "If a dealer's feed goes silent, SpotCompare flags it visually so you never trade on outdated data.",
      },
      {
        title: "Optimized for Mobile Networks",
        description:
          "Lightweight data packets ensure fast updates even on 4G connections with high latency.",
      },
    ],
    howItWorks: [
      "When you open SpotCompare, a live connection is established with our servers.",
      "Our system monitors 100+ dealer feeds continuously, detecting every price change.",
      "Changed rates are broadcast instantly to all connected users.",
      "Your screen updates in under one second — with animated transitions so you can track movements.",
      "If a connection drops, auto-reconnect kicks in seamlessly within seconds.",
    ],
    relatedSlugs: ["auto-reconnect", "dealer-coverage", "smart-comparison"],
  },
  {
    slug: "dealer-coverage",
    icon: BarChart3,
    title: "100+ Dealers, 17+ Cities",
    tag: "Coverage",
    headline: "India's Largest Bullion Dealer Network on One Screen",
    subheadline:
      "From Mumbai to Jaipur, Delhi to Chennai — track every major bullion dealer across India without switching apps.",
    description:
      "SpotCompare aggregates live buy and sell rates from over 100 bullion dealers across 17+ cities in India. Every major bullion hub is covered — Mumbai, Delhi, Jaipur, Chennai, Bengaluru, Ahmedabad, Kolkata, Hyderabad, and more. New dealers and cities are added regularly based on user demand. No other platform offers this breadth of coverage with real-time updates.",
    benefits: [
      {
        title: "Widest Coverage",
        description:
          "100+ dealers across 17+ Indian cities — the most comprehensive bullion rate aggregation available.",
      },
      {
        title: "All Major Hubs",
        description:
          "Mumbai, Delhi, Jaipur, Chennai, Bengaluru, Ahmedabad, Kolkata, Hyderabad, and growing.",
      },
      {
        title: "Regular Additions",
        description:
          "We onboard new dealers continuously. Request your local dealer and we'll add them.",
      },
      {
        title: "Single-Screen View",
        description:
          "No more tab-switching or phone calls. Every dealer's rates visible in one glance.",
      },
    ],
    howItWorks: [
      "SpotCompare maintains direct connections to 100+ dealer rate feeds across India.",
      "Each dealer's gold and silver buy/sell rates are collected and normalized in real time.",
      "Rates are organized by city and dealer, displayed in a clean, scannable interface.",
      "New dealers are onboarded within days — just email us the dealer name and city.",
      "City-level filtering lets you focus on the markets that matter most to you.",
    ],
    relatedSlugs: ["real-time-updates", "cities", "smart-comparison"],
  },
  {
    slug: "view-modes",
    icon: Eye,
    title: "Buy / Sell / Differences Mode",
    tag: "Analysis",
    headline: "Three Powerful Ways to Read the Market",
    subheadline:
      "Switch between Buy, Sell, and Differences view modes to analyze rates from every angle — instantly.",
    description:
      "SpotCompare gives you three distinct view modes to suit your analysis needs. Buy mode shows all dealers' buying prices. Sell mode shows selling prices. And Differences mode — our most powerful feature — lets you pick a reference dealer and see how every other dealer compares, with positive and negative differences color-coded for instant comprehension. Whether you're looking to buy gold, sell silver, or find arbitrage opportunities, there's a view designed for you.",
    benefits: [
      {
        title: "Buy Mode",
        description:
          "Focus exclusively on dealer buying rates. Perfect when you're looking to sell your bullion.",
      },
      {
        title: "Sell Mode",
        description:
          "See only selling rates across all dealers. Ideal when you're ready to purchase.",
      },
      {
        title: "Differences Mode",
        description:
          "Peg a reference dealer and instantly see how everyone else compares — color-coded green/red.",
      },
      {
        title: "One-Tap Switching",
        description:
          "Toggle between modes with a single tap. Each watchlist remembers your preferred mode.",
      },
    ],
    howItWorks: [
      "Open any watchlist and tap the mode selector at the top of the screen.",
      "In Buy or Sell mode, rates are displayed with the BEST rate automatically highlighted.",
      "In Differences mode, select a reference dealer by tapping on any dealer card.",
      "All other dealer rates now show the +/- difference relative to your reference.",
      "Green indicates better rates, red indicates worse — making the best deal obvious at a glance.",
    ],
    relatedSlugs: ["smart-comparison", "spread-analysis", "watchlists"],
  },
  {
    slug: "smart-comparison",
    icon: ArrowLeftRight,
    title: "Smart Rate Comparison",
    tag: "Intelligence",
    headline: "The Best Rate, Found Instantly",
    subheadline:
      "Automatic BEST badges and color-coded differences mean you never have to manually scan rates again.",
    description:
      "SpotCompare's smart comparison engine automatically identifies the highest buy rate and lowest sell rate across all your tracked dealers and highlights them with a prominent BEST badge. Combined with Differences mode's color-coded positive/negative indicators, you can instantly spot the best deal without scanning through dozens of numbers. It's like having a rate analyst working for you — except it runs every second.",
    benefits: [
      {
        title: "BEST Rate Badges",
        description:
          "The highest buy and lowest sell rates are automatically tagged with a gold BEST badge.",
      },
      {
        title: "Color-Coded Differences",
        description:
          "Green for favorable, red for unfavorable — no mental math required.",
      },
      {
        title: "Real-Time Recalculation",
        description:
          "BEST badges and differences update every second as rates change across dealers.",
      },
      {
        title: "Works with Multipliers",
        description:
          "Apply rate multipliers and the BEST calculation adjusts automatically.",
      },
    ],
    howItWorks: [
      "SpotCompare scans all dealer rates in your active watchlist every second.",
      "The highest buy rate and lowest sell rate are identified automatically.",
      "BEST badges appear on the winning dealer cards — updating in real time.",
      "In Differences mode, every card shows its +/- distance from your reference dealer.",
      "Combined with multipliers and sorting, you always know where the best deal is.",
    ],
    relatedSlugs: ["view-modes", "spread-analysis", "real-time-updates"],
  },
  {
    slug: "watchlists",
    icon: Layers,
    title: "Multiple Watchlists",
    tag: "Organization",
    headline: "Your Markets, Your Way",
    subheadline:
      "Create separate watchlists for gold, silver, specific cities, or custom dealer groups — and swipe between them.",
    description:
      "Not every trader watches the same dealers. SpotCompare lets you create multiple watchlists, each with its own selection of dealers, view mode, sort order, and rate multiplier. Create one watchlist for Mumbai gold dealers, another for silver across cities, and a third for your top five favorites. On mobile, swipe between watchlists with a gesture. Each watchlist is independently configured and persists across sessions.",
    benefits: [
      {
        title: "Unlimited Watchlists",
        description:
          "Create as many watchlists as you need — organized by metal, city, strategy, or preference.",
      },
      {
        title: "Independent Settings",
        description:
          "Each watchlist has its own view mode, sort order, multiplier, and dealer selection.",
      },
      {
        title: "Swipe Navigation",
        description:
          "On mobile, swipe left/right between watchlists with smooth animated transitions.",
      },
      {
        title: "Cloud Persistence",
        description:
          "Your watchlists sync to your account. Log in from any device and they're all there.",
      },
    ],
    howItWorks: [
      "Tap the + button to create a new watchlist and give it a name.",
      "Add dealers to your watchlist by browsing the full dealer directory.",
      "Configure each watchlist's view mode, sort order, and rate multiplier independently.",
      "Swipe between watchlists on mobile, or use tabs on desktop.",
      "All watchlist data is stored per-user and syncs across devices automatically.",
    ],
    relatedSlugs: ["drag-and-drop", "view-modes", "mobile"],
  },
  {
    slug: "drag-and-drop",
    icon: GripVertical,
    title: "Drag & Drop Ordering",
    tag: "Customization",
    headline: "Arrange Dealers the Way You Think",
    subheadline:
      "Drag dealer cards into any order you want. Your custom arrangement persists across sessions.",
    description:
      "Every trader has their go-to dealers — the ones they check first. SpotCompare's drag-and-drop ordering lets you position those dealers at the top of your watchlist. Long-press any dealer card and drag it to reposition. The order persists across sessions, so your layout is always ready when you open the app. On mobile, haptic feedback confirms every move. Combined with auto-sorting modes, you get full control over how your rate data is displayed.",
    benefits: [
      {
        title: "Long-Press to Drag",
        description:
          "Touch and hold any dealer card to activate drag mode, then move it anywhere in the list.",
      },
      {
        title: "Haptic Feedback",
        description:
          "Feel a subtle vibration on mobile when you grab and release cards — tactile confirmation.",
      },
      {
        title: "Persistent Order",
        description:
          "Your custom arrangement is saved and restored every time you open the app.",
      },
      {
        title: "Combined with Sorting",
        description:
          "Switch between manual order and auto-sort (by rate, name, or spread) anytime.",
      },
    ],
    howItWorks: [
      "Long-press any dealer card in your watchlist to activate drag mode.",
      "The card lifts with a subtle shadow effect, and other cards make room as you drag.",
      "Drop the card in its new position — haptic feedback confirms the placement.",
      "Your custom order is saved to your account and persists across sessions.",
      "Switch to auto-sort mode anytime, then back to your manual order with one tap.",
    ],
    relatedSlugs: ["watchlists", "mobile", "smart-comparison"],
  },
  {
    slug: "calculator",
    icon: Calculator,
    title: "Built-in Calculator",
    tag: "Productivity",
    headline: "Calculate on Live Rates Without Leaving the App",
    subheadline:
      "Add margins, calculate totals, apply multipliers, and convert units — all on real-time dealer rates.",
    description:
      "SpotCompare's built-in calculator lets you perform arithmetic directly on live rates without switching to another app. Apply rate multipliers from x0.1 to x100 to convert between units (per gram, per 10 grams, per tola, per kg). Calculate margins, add making charges, or compute order totals — all while rates update in real time beneath your calculations. It's the tool every bullion trader reaches for multiple times a day.",
    benefits: [
      {
        title: "Rate Multipliers",
        description:
          "Convert rates between units instantly — x10 for per-10-gram, x100 for per-kg, or any custom value.",
      },
      {
        title: "Live Rate Integration",
        description:
          "Calculator works on top of live rates — your calculations update as prices change.",
      },
      {
        title: "Preset & Custom Values",
        description:
          "Quick presets for common multipliers (0.1x, 1x, 10x, 100x) plus custom entry for any value.",
      },
      {
        title: "No App Switching",
        description:
          "Everything you need in one screen — rates, calculator, and comparison together.",
      },
    ],
    howItWorks: [
      "Tap the multiplier button on any watchlist to access rate scaling options.",
      "Choose a preset (x0.1, x1, x10, x100) or enter a custom multiplier.",
      "All dealer rates in your watchlist instantly recalculate with the applied multiplier.",
      "BEST rate detection and Differences mode work correctly with multiplied values.",
      "Use the full calculator for margins, totals, and custom arithmetic on any rate.",
    ],
    relatedSlugs: ["spread-analysis", "smart-comparison", "view-modes"],
  },
  {
    slug: "sona-ai",
    icon: Bot,
    title: "SONA AI Agent",
    tag: "AI",
    headline: "Your Personal Bullion Market Analyst, Powered by AI",
    subheadline:
      "Ask questions in plain language and get instant, data-driven answers from live platform data. SONA finds the best rates, compares dealers, searches news, and even sets alerts — all through conversation.",
    description:
      "SONA is SpotCompare's built-in AI assistant, purpose-built for bullion traders. Instead of navigating screens and tapping through menus, just ask SONA what you need — 'What's the best gold 999 rate right now?', 'Compare KJ Bullion vs CSV Bullion', 'Set an alert for gold below 93000'. SONA queries live platform data in real time, runs the numbers, and gives you a clear, concise answer in seconds. It's not a generic chatbot — it's a bullion market specialist that speaks your language and works exclusively with SpotCompare's live data.",
    benefits: [
      {
        title: "Natural Language Queries",
        description:
          "Ask in plain Hindi or English — 'best gold rate', 'cheapest silver 999', 'compare dealers' — and SONA understands instantly.",
      },
      {
        title: "Live Data, Not Guesswork",
        description:
          "Every answer is computed from real-time platform data. SONA uses the same live data that powers your watchlist — nothing stale, nothing made up.",
      },
      {
        title: "8 Specialized Tools",
        description:
          "Best rate finder, live rate lookup, dealer comparison, news search, spread calculator, alert creation, watchlist management, and dealer directory.",
      },
      {
        title: "Actions, Not Just Answers",
        description:
          "SONA can create price alerts and add scripts to your watchlist — with a confirmation step so you stay in control.",
      },
    ],
    howItWorks: [
      "Tap the SONA chat button from any screen in the app to open the AI assistant.",
      "Type your question in natural language — SONA understands bullion market terminology.",
      "SONA selects the right tool (rate lookup, comparison, news search, etc.) and queries live data.",
      "You get a formatted, data-rich answer streamed in real time — with dealer names, rates, and timestamps.",
      "For actions like alerts or watchlist changes, SONA asks for your confirmation before executing.",
    ],
    relatedSlugs: ["smart-comparison", "price-alerts", "news"],
  },
  {
    slug: "news",
    icon: Newspaper,
    title: "Live Bullion News",
    tag: "News",
    headline: "Market-Moving News, Right Next to Your Rates",
    subheadline:
      "Curated bullion news from India and global markets — so you always know why rates are moving.",
    description:
      "Rates don't move in a vacuum. SpotCompare's built-in news feed pulls curated bullion and precious metals news from trusted Indian and international sources. See headlines about RBI policy, international gold prices, import duty changes, geopolitical events, and festival demand — all alongside your live rates. When gold jumps ₹500 in an hour, you'll know exactly why without opening another app or browser tab.",
    benefits: [
      {
        title: "India + Global Coverage",
        description:
          "News from Indian bullion markets and international precious metals sources.",
      },
      {
        title: "Curated Feed",
        description:
          "Only market-relevant news — no noise, no spam, no unrelated stories.",
      },
      {
        title: "Alongside Rates",
        description:
          "View news right next to your live rates — context and data on one screen.",
      },
      {
        title: "Real-Time Updates",
        description:
          "News feed updates continuously so you never miss a market-moving development.",
      },
    ],
    howItWorks: [
      "SpotCompare aggregates news from multiple trusted bullion and financial sources.",
      "Stories are filtered for relevance to gold, silver, and precious metals markets.",
      "Headlines appear in the news section of the app, updated throughout the day.",
      "Tap any headline to read the full article from the original source.",
      "News context helps you understand sudden price movements and make informed decisions.",
    ],
    relatedSlugs: ["real-time-updates", "price-alerts", "dealer-coverage"],
  },
  {
    slug: "cities",
    icon: MapPin,
    title: "17+ Cities Covered",
    tag: "Geography",
    headline: "Every Major Bullion Hub in India, Connected",
    subheadline:
      "Mumbai, Delhi, Jaipur, Chennai, Bengaluru — and growing. Track dealers across India's bullion corridor.",
    description:
      "India's bullion market isn't centralized — it spans dozens of cities, each with its own dealers and rate dynamics. SpotCompare covers 17+ cities including Mumbai, Delhi, Jaipur, Chennai, Bengaluru, Ahmedabad, Kolkata, Hyderabad, Surat, Rajkot, and more. This means you can compare rates not just across dealers in your city, but across the entire country. Regional arbitrage opportunities that were previously invisible are now one glance away.",
    benefits: [
      {
        title: "Major Hubs Covered",
        description:
          "Mumbai, Delhi, Jaipur, Chennai, Bengaluru, Ahmedabad, Kolkata, Hyderabad, and more.",
      },
      {
        title: "Cross-City Comparison",
        description:
          "Compare rates across cities to spot regional price differences and arbitrage opportunities.",
      },
      {
        title: "Growing Network",
        description:
          "New cities added regularly based on user demand. Request your city and we'll prioritize it.",
      },
      {
        title: "City-Wise Filtering",
        description:
          "Create watchlists by city to focus on your local market or monitor multiple regions.",
      },
    ],
    howItWorks: [
      "SpotCompare connects to dealer rate feeds in 17+ cities across India.",
      "Each dealer is tagged with their city, making cross-city comparison easy.",
      "Create city-specific watchlists to monitor your local market closely.",
      "Use cross-city watchlists to spot regional price differences.",
      "Request new city additions via the contact page — we onboard cities within weeks.",
    ],
    relatedSlugs: ["dealer-coverage", "watchlists", "smart-comparison"],
  },
  {
    slug: "auto-reconnect",
    icon: RefreshCw,
    title: "Auto-Reconnect",
    tag: "Reliability",
    headline: "Never Miss a Beat, Even on Shaky Networks",
    subheadline:
      "Connection drops? SpotCompare reconnects automatically and resumes updates seamlessly — no action needed.",
    description:
      "Mobile networks are unpredictable — tunnels, elevators, network switches, and dead zones can interrupt your connection at any time. SpotCompare's auto-reconnect system detects disconnections instantly and re-establishes the connection within seconds. Your session is refreshed seamlessly, your watchlist state is preserved, and live rates resume flowing without you lifting a finger. You'll barely notice it happened.",
    benefits: [
      {
        title: "Instant Detection",
        description:
          "Connection drops are detected within seconds using continuous health monitoring.",
      },
      {
        title: "Seamless Resume",
        description:
          "Rates resume flowing automatically — no manual reconnect, no page reload needed.",
      },
      {
        title: "Session Refresh",
        description:
          "Your session is refreshed silently during reconnection — no re-login needed.",
      },
      {
        title: "State Preservation",
        description:
          "Your watchlist, view mode, sort order, and scroll position are all preserved.",
      },
    ],
    howItWorks: [
      "SpotCompare continuously monitors your connection health.",
      "When a disconnection is detected, the reconnect system activates immediately.",
      "A new connection is established automatically with smart retry logic.",
      "Your session is validated and refreshed if needed during the reconnection.",
      "Live rates resume flowing to your screen — your entire app state is preserved.",
    ],
    relatedSlugs: ["real-time-updates", "security", "mobile"],
  },
  {
    slug: "security",
    icon: Shield,
    title: "Secure Authentication",
    tag: "Security",
    headline: "Enterprise-Grade Security for Your Trading Data",
    subheadline:
      "Encrypted sessions, secure storage, and controlled access keep your account safe.",
    description:
      "SpotCompare takes security seriously. Every user session is encrypted and securely stored. All connections are validated, ensuring only authorized users receive real-time data. All data transmission is encrypted, and user sessions are managed with automatic refresh and secure logout.",
    benefits: [
      {
        title: "Secure Authentication",
        description:
          "Industry-standard authentication with automatic session refresh and secure storage.",
      },
      {
        title: "Encrypted Connections",
        description:
          "All data — including live rate streams — is transmitted over encrypted connections.",
      },
      {
        title: "Controlled Access",
        description:
          "Verified signup ensures only authorized professionals access the platform.",
      },
      {
        title: "Secure Logout",
        description:
          "Full session invalidation on logout. All data is cleared completely from the device.",
      },
    ],
    howItWorks: [
      "Sign up with OTP verification to create your account — quick and secure.",
      "Log in with your credentials to start a secure session on your device.",
      "Every connection is authenticated with your secure session.",
      "Sessions are refreshed automatically — no interruption to your experience.",
      "Logging out invalidates your session and clears all data from the device.",
    ],
    relatedSlugs: ["auto-reconnect", "watchlists", "mobile"],
  },
  {
    slug: "mobile",
    icon: Smartphone,
    title: "Mobile-First Design",
    tag: "Mobile",
    headline: "Built for Traders on the Go",
    subheadline:
      "99% of our users are on mobile. Every pixel, gesture, and interaction is designed for touch screens first.",
    description:
      "SpotCompare isn't a desktop app squeezed into a phone screen — it's designed mobile-first from the ground up. Touch targets are sized for thumbs. Swipe gestures navigate between watchlists. Haptic feedback confirms drag-and-drop actions. Responsive layouts adapt seamlessly from small phones to tablets. The entire interface is optimized for one-handed use during market hours, because we know traders are glancing at their phones between calls, not sitting at a desk.",
    benefits: [
      {
        title: "Touch-Optimized",
        description:
          "Large tap targets, swipe navigation, and thumb-friendly layouts for real-world mobile use.",
      },
      {
        title: "Haptic Feedback",
        description:
          "Feel subtle vibrations when dragging cards, toggling modes, and confirming actions.",
      },
      {
        title: "Responsive Layouts",
        description:
          "Adapts perfectly from small phones (320px) to tablets and desktops.",
      },
      {
        title: "Low Data Usage",
        description:
          "Lightweight data transfers and optimized rendering for fast performance on mobile networks.",
      },
    ],
    howItWorks: [
      "Open SpotCompare in your mobile browser — no app installation needed.",
      "Swipe between watchlists, tap to toggle view modes, long-press to reorder.",
      "Haptic feedback provides tactile confirmation for key interactions.",
      "The interface adapts to your screen size with responsive breakpoints.",
      "Optimized data transfer ensures fast updates even on 4G and slower connections.",
    ],
    relatedSlugs: ["drag-and-drop", "watchlists", "auto-reconnect"],
  },
  {
    slug: "price-alerts",
    icon: Bell,
    title: "Price Alerts",
    tag: "Alerts",
    headline: "Never Miss Your Target Rate",
    subheadline:
      "Set custom alerts on any dealer or script. Get notified the instant rates hit your price — so you never miss an opportunity.",
    description:
      "Bullion markets move fast, and you can't watch the screen every second. SpotCompare's price alerts let you set target prices on any dealer or script, and the moment rates cross your threshold, you're notified instantly. Set alerts for gold crossing a key level, a specific dealer's sell rate dropping below a target, or silver breaching resistance. Multiple alerts, multiple dealers — all running simultaneously in the background while you focus on your business.",
    benefits: [
      {
        title: "Custom Thresholds",
        description:
          "Set above/below alerts on any dealer's buy or sell rate with precise targets.",
      },
      {
        title: "Instant Notifications",
        description:
          "Get notified the second rates cross your threshold — no delay, no lag.",
      },
      {
        title: "Multiple Alerts",
        description:
          "Run as many alerts as you need across different dealers, metals, and price levels.",
      },
      {
        title: "Background Monitoring",
        description:
          "Alerts run even when you're not actively watching — so you can focus on your business.",
      },
    ],
    howItWorks: [
      "Navigate to any dealer card and tap the alert icon to set a price target.",
      "Choose the rate type (buy/sell), direction (above/below), and your target price.",
      "The alert monitors rates in real time against your specified threshold.",
      "When the rate crosses your target, you receive an instant notification.",
      "View, edit, or delete your active alerts from the alerts management panel.",
    ],
    relatedSlugs: ["real-time-updates", "smart-comparison", "news"],
  },
  {
    slug: "spread-analysis",
    icon: TrendingUp,
    title: "Spread Analysis",
    tag: "Depth",
    headline: "See the Full Picture with Buy-Sell Spreads",
    subheadline:
      "Expand any dealer card to view detailed spread calculations — with multiplier support for precise analysis.",
    description:
      "A rate is only half the story — the spread between buy and sell prices tells you how much a dealer is charging in margin. SpotCompare's spread analysis feature shows you the buy-sell spread for every tracked dealer, updated in real time. Expand any dealer card to see spread calculations with your applied rate multiplier factored in. Compare spreads across dealers to find who's offering the tightest margins. In a market where ₹5 per gram makes a difference, this visibility is invaluable.",
    benefits: [
      {
        title: "Instant Spread View",
        description:
          "See buy-sell spread for any dealer with a single tap — no manual calculation needed.",
      },
      {
        title: "Multiplier-Aware",
        description:
          "Spreads recalculate automatically when you apply rate multipliers (x10, x100, etc.).",
      },
      {
        title: "Cross-Dealer Comparison",
        description:
          "Compare spreads across all dealers to identify who's offering the tightest margins.",
      },
      {
        title: "Real-Time Updates",
        description:
          "Spread values update every second as buy and sell rates change.",
      },
    ],
    howItWorks: [
      "Tap any dealer card in your watchlist to expand it and reveal spread details.",
      "The spread (sell minus buy) is calculated and displayed in real time.",
      "If you've applied a rate multiplier, the spread adjusts accordingly.",
      "Compare spreads across dealers to find the most competitive margins.",
      "Use spread data alongside BEST badges and Differences mode for comprehensive analysis.",
    ],
    relatedSlugs: ["smart-comparison", "view-modes", "calculator"],
  },
];

export function getFeatureBySlug(slug: string): FeatureDetail | undefined {
  return featureDetails.find((f) => f.slug === slug);
}

export function getAllSlugs(): string[] {
  return featureDetails.map((f) => f.slug);
}

/** Returns feature details with dynamic stats interpolated into copy. */
export function getFeatureDetails(stats: { dealers: number; cities: number }): FeatureDetail[] {
  return featureDetails.map((f) => {
    if (f.slug === "real-time-updates") {
      return {
        ...f,
        howItWorks: f.howItWorks.map((step, i) =>
          i === 1
            ? `Our system monitors ${stats.dealers}+ dealer feeds continuously, detecting every price change.`
            : step
        ),
      };
    }
    if (f.slug === "dealer-coverage") {
      return {
        ...f,
        title: `${stats.dealers}+ Dealers, ${stats.cities}+ Cities`,
        description: f.description
          .replace("over 100 bullion dealers across 17+ cities", `over ${stats.dealers} bullion dealers across ${stats.cities}+ cities`)
          .replace("No other platform offers this breadth", "No other platform offers this breadth"),
        benefits: f.benefits.map((b, i) =>
          i === 0
            ? { ...b, description: `${stats.dealers}+ dealers across ${stats.cities}+ Indian cities — the most comprehensive bullion rate aggregation available.` }
            : b
        ),
        howItWorks: f.howItWorks.map((step, i) =>
          i === 0
            ? `SpotCompare maintains direct connections to ${stats.dealers}+ dealer rate feeds across India.`
            : step
        ),
      };
    }
    if (f.slug === "cities") {
      return {
        ...f,
        title: `${stats.cities}+ Cities Covered`,
        description: f.description.replace("covers 17+ cities", `covers ${stats.cities}+ cities`),
        howItWorks: f.howItWorks.map((step, i) =>
          i === 0
            ? `SpotCompare connects to dealer rate feeds in ${stats.cities}+ cities across India.`
            : step
        ),
      };
    }
    return f;
  });
}
