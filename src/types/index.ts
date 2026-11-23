import type { CollectionEntry } from "astro:content";

// ─── Content Collection Data Types ───────────────────────────────────────────
// Derived directly from the Zod schemas in content.config.ts — always in sync.

export type About = CollectionEntry<"about">["data"];
export type OpenLetter = CollectionEntry<"openLetter">["data"];
export type Contact = CollectionEntry<"contact">["data"];
export type Homepage = CollectionEntry<"homepage">["data"];
export type Features = CollectionEntry<"features">["data"];
export type Pricing = CollectionEntry<"pricing">["data"];
export type PlanId = Pricing["plans"][number]["plan_id"];
export type CaseStudy = CollectionEntry<"caseStudy">["data"];
export type Careers = CollectionEntry<"careers">["data"];
export type Integrations = CollectionEntry<"integrations">["data"];

// ─── Section Data Types ───────────────────────────────────────────────────────

export type CtaSection = CollectionEntry<"ctaSection">["data"];
export type FaqSection = CollectionEntry<"faqSection">["data"];
export type OurStorySection = CollectionEntry<"ourStorySection">["data"];
export type BusinessNeedsSection =
  CollectionEntry<"businessNeedsSection">["data"];

// ─── Config File Types ────────────────────────────────────────────────────────

export interface NavLink {
  name: string;
  url: string;
}

export interface Menu {
  main: NavLink[];
  footer_col_1_title: string;
  footer_col_2_title: string;
  footer_col_3_title: string;
  footer_primary: NavLink[];
  footer_resource: NavLink[];
  footer_legal: NavLink[];
}

export interface SocialLink {
  name: string;
  icon: string;
  link: string;
}

export interface SocialType {
  main: SocialLink[];
}

// ─── Shared Component Prop Types ─────────────────────────────────────────────

export type OurFeaturesSection = Homepage["our_features"];
export type FeatureItem = OurFeaturesSection["items"][number];
