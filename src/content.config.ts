import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const commonFields = {
  title: z.string(),
  description: z.string().optional(),
  meta_title: z.string().optional(),
  image: z.string().optional(),
  draft: z.boolean().optional(),
  noindex: z.boolean().optional(),
};

const buttonSchema = z.object({
  enable: z.boolean(),
  label: z.string(),
  link: z.string(),
});

const pageHeaderSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
});

const bannerSchema = z.object({
  title: z.string(),
  content: z.string(),
  image: z.string(),
  button_primary: buttonSchema,
  button_secondary: buttonSchema,
});

const sectionCopy = {
  enable: z.boolean(),
  title: z.string(),
  content: z.string(),
};

const featureSectionSchema = z.object({
  ...sectionCopy,
  items: z.array(
    z.object({ logo: z.string(), title: z.string(), content: z.string() }),
  ),
});

const faqSchema = z.object({
  enable: z.boolean(),
  title: z.string(),
  description: z.string(),
  items: z.array(z.object({ question: z.string(), answer: z.string() })),
});

const narrativeSchema = z.object({ title: z.string(), content: z.string() });
const narrativeListSchema = narrativeSchema.extend({
  items: z.array(z.string()),
});

const pagesCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/pages" }),
  schema: z.object(commonFields),
});

const aboutCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/about" }),
  schema: z.object({
    ...commonFields,
    page_header: pageHeaderSchema.extend({ image: z.string() }),
    core_values: featureSectionSchema,
  }),
});

const openLetterCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/open-letter" }),
  schema: z.object({
    ...commonFields,
    founder: z.object({
      image: z.string(),
      signature: z.string(),
      name: z.string(),
      role: z.string(),
    }),
    date: z.string(),
    salutation: z.string(),
    paragraphs: z.array(z.string()).min(6).max(9),
    closing: z.string(),
    button: buttonSchema,
  }),
});

const contactCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/contact" }),
  schema: z.object({
    ...commonFields,
    page_header: pageHeaderSchema,
    contact_info: z.object({
      enable: z.boolean(),
      items: z.array(
        z.object({
          type: z.enum(["email", "phone", "calendar"]),
          title: z.string(),
          detail: z.string(),
          link: z.string(),
          icon: z.string(),
        }),
      ),
    }),
  }),
});

const homepageCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/homepage" }),
  schema: z.object({
    ...commonFields,
    banner: bannerSchema,
    main_features: z.object({
      ...sectionCopy,
      items: z.array(z.string()),
    }),
    value_props: z.object({
      ...sectionCopy,
      items: z.array(
        z.object({
          logo: z.string(),
          title: z.string(),
          list: z.array(z.string()),
        }),
      ),
    }),
    our_features: featureSectionSchema,
    growth_process: z.object({
      enable: z.boolean(),
      title: z.string(),
      items: z.array(
        z.object({ logo: z.string(), title: z.string(), content: z.string() }),
      ),
    }),
    lead_generation: z.object({
      ...sectionCopy,
      subtitle: z.string(),
      list: z.array(z.string()),
      button: buttonSchema,
    }),
    pricing: z.object(sectionCopy),
  }),
});

const featuresCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/features" }),
  schema: z.object({
    ...commonFields,
    banner: bannerSchema,
    roles: z.object({
      enable: z.boolean(),
      title: z.string(),
      items: z
        .array(
          z.object({
            id: z.enum(["student", "teacher", "administrator"]),
            title: z.string(),
            content: z.string(),
            image: z.string(),
            points: z.array(z.string()).length(3),
          }),
        )
        .length(3),
    }),
  }),
});

const pricingCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/pricing" }),
  schema: z.object({
    ...commonFields,
    page_header: z.object({ title: z.string(), content: z.string() }),
    toggler: z.object({ monthly_label: z.string(), yearly_label: z.string() }),
    plans: z.array(
      z.object({
        plan_id: z.enum(["starter", "campus", "enterprise"]),
        title: z.string(),
        price: z.string(),
        yearly_price: z.string(),
        is_featured: z.boolean(),
        button: buttonSchema,
        description: z.string(),
        features: z.array(
          z.object({
            label: z.string(),
            included: z.boolean(),
            tooltip: z.string().optional(),
          }),
        ),
      }),
    ),
    comparison: z.object({
      enable: z.boolean(),
      title: z.string(),
      headers: z.array(
        z.object({
          label: z.string(),
          plan_id: z.enum(["starter", "campus", "enterprise"]).optional(),
        }),
      ),
      rows: z.array(
        z.object({
          feature: z.string(),
          kind: z.enum(["monthly_price", "yearly_price"]).optional(),
          values: z.array(z.union([z.string(), z.boolean()])),
        }),
      ),
    }),
  }),
});

// These collections contain an index and explicitly illustrative detail pages.
const caseStudyCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/case-study" }),
  schema: z.object({
    ...commonFields,
    page_header: pageHeaderSchema.optional(),
    category: z.string().optional(),
    context: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .optional(),
    overview: narrativeSchema.optional(),
    challenges: narrativeSchema.optional(),
    solution: narrativeListSchema.optional(),
    evaluation: narrativeListSchema.optional(),
  }),
});

const careersCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "src/content/careers" }),
  schema: z.object({
    ...commonFields,
    page_header: pageHeaderSchema.optional(),
    role_profiles: z.object(sectionCopy).optional(),
    discipline: z.string().optional(),
  }),
});

const integrationsCollection = defineCollection({
  loader: glob({ pattern: "**/-index.md", base: "src/content/integrations" }),
  schema: z.object({
    ...commonFields,
    page_header: pageHeaderSchema,
    integrations: z.object({
      enable: z.boolean(),
      items: z.array(
        z.object({ icon: z.string(), title: z.string(), content: z.string() }),
      ),
    }),
  }),
});

const ctaSectionCollection = defineCollection({
  loader: glob({
    pattern: "**/call-to-action.md",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    description: z.string(),
    button: buttonSchema,
  }),
});

const faqSectionCollection = defineCollection({
  loader: glob({ pattern: "**/faq.md", base: "src/content/sections" }),
  schema: faqSchema,
});

const ourStorySectionCollection = defineCollection({
  loader: glob({ pattern: "**/our-story.md", base: "src/content/sections" }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    ceo: z.object({ image: z.string(), name: z.string(), role: z.string() }),
    letter: z.string(),
    letter_points_title: z.string().optional(),
    letter_points: z.array(z.string()),
    closing_content: z.string().optional(),
    button: buttonSchema,
  }),
});

const businessNeedsSectionCollection = defineCollection({
  loader: glob({
    pattern: "**/business-needs.md",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    items: z.array(
      z.object({ number: z.string(), title: z.string(), content: z.string() }),
    ),
  }),
});

export const collections = {
  pages: pagesCollection,
  about: aboutCollection,
  openLetter: openLetterCollection,
  contact: contactCollection,
  homepage: homepageCollection,
  features: featuresCollection,
  pricing: pricingCollection,
  caseStudy: caseStudyCollection,
  careers: careersCollection,
  integrations: integrationsCollection,
  ctaSection: ctaSectionCollection,
  faqSection: faqSectionCollection,
  ourStorySection: ourStorySectionCollection,
  businessNeedsSection: businessNeedsSectionCollection,
};
