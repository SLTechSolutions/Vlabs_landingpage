---
title: "Pricing"
meta_title: "VLABS Pricing | Plans for Classrooms and Schools"
description: "Explore flexible VLABS plans for classrooms, schools, and education networks. Pricing is calculated in USD per account."
draft: false

page_header:
  title: "Choose the right plan for <strong>your learning environment</strong>"
  content: "VLABS combines interactive science simulations with learning management tools. Compare reference plans for classrooms, schools and education networks. Prices are listed in USD per account; confirm feature availability and implementation scope with VLABS."

toggler:
  monthly_label: "Billed monthly"
  yearly_label: "Billed annually"

plans:
  - title: "Starter"
    plan_id: "starter"
    price: "2.69"
    yearly_price: "26.90"
    is_featured: false
    button:
      enable: true
      label: "Get Started with Starter"
      link: "/contact"
    description: "For teachers, classrooms, and subject departments beginning with interactive simulations and essential learning management tools."
    price_note: "$2.69/account/month"
    yearly_price_note: "$26.90/account/year"
    features:
      - label: "Interactive science simulations"
        included: true
      - label: "Courses and assignments"
        included: true
        tooltip: "Teachers can organise learning materials, assign activities, and collect student submissions."
      - label: "Gradebook and results tracking"
        included: true
      - label: "Dedicated spaces for teachers and students"
        included: true
      - label: "Adaptive practice"
        included: false
      - label: "Advanced learning analytics"
        included: false
      - label: "Administration dashboard"
        included: false

  - title: "Campus"
    plan_id: "campus"
    price: "3.09"
    yearly_price: "30.90"
    is_featured: true
    button:
      enable: true
      label: "Contact VLABS"
      link: "/contact"
    description: "For schools seeking to connect simulations, assignments, and learning data across multiple classes while helping teachers follow student progress more effectively."
    price_note: "$3.09/account/month"
    yearly_price_note: "$30.90/account/year"
    features:
      - label: "Everything in Starter"
        included: true
      - label: "Extended simulation library"
        included: true
      - label: "Adaptive practice"
        included: true
        tooltip: "Supports practice activities aligned with each learner’s progress and learning results."
      - label: "Learning analytics for teachers"
        included: true
      - label: "Class-level progress tracking"
        included: true
      - label: "Teacher onboarding and implementation support"
        included: true
      - label: "Organisation-wide administration dashboard"
        included: false

  - title: "Enterprise"
    plan_id: "enterprise"
    price: "3.89"
    yearly_price: "38.90"
    is_featured: false
    button:
      enable: true
      label: "Contact VLABS"
      link: "/contact"
    description: "For educational institutions and school networks requiring centralised administration, system integration, advanced permissions, and dedicated implementation support."
    price_note: "$3.89/account/month"
    yearly_price_note: "$38.90/account/year"
    features:
      - label: "Everything in Campus"
        included: true
      - label: "Administration dashboard and reporting"
        included: true
      - label: "Multi-school and multi-unit management"
        included: true
      - label: "SSO and advanced role management"
        included: true
        tooltip: "Integration availability depends on the institution’s identity provider, security requirements, and existing infrastructure."
      - label: "Integration with existing systems"
        included: true
      - label: "Custom simulation development"
        included: true
        tooltip: "The scope, timeline, and cost of custom development will be agreed separately for each request."
      - label: "Dedicated implementation specialist"
        included: true

comparison:
  enable: true
  title: "Compare plans based on <strong>your needs</strong>"
  headers:
    - label: "Features"
    - label: "Starter"
      plan_id: "starter"
    - label: "Campus"
      plan_id: "campus"
    - label: "Enterprise"
      plan_id: "enterprise"

  rows:
    - feature: "Price per account/month"
      kind: "monthly_price"
      values: ["$2.69", "$3.09", "$3.89"]

    - feature: "Price per account/year"
      kind: "yearly_price"
      values: ["$26.90", "$30.90", "$38.90"]

    - feature: "Interactive science simulations"
      values: [true, true, true]

    - feature: "Courses and assignments"
      values: [true, true, true]

    - feature: "Gradebook and results tracking"
      values: [true, true, true]

    - feature: "Extended simulation library"
      values: [false, true, true]

    - feature: "Adaptive practice"
      values: [false, true, true]

    - feature: "Learning analytics for teachers"
      values: [false, true, true]

    - feature: "Class-level progress tracking"
      values: [false, true, true]

    - feature: "Administration dashboard"
      values: [false, false, true]

    - feature: "Multi-school and multi-unit management"
      values: [false, false, true]

    - feature: "SSO and advanced role management"
      values: [false, false, true]

    - feature: "Support level"
      values:
        - "Online support"
        - "Priority support and implementation guidance"
        - "Dedicated implementation specialist"

pricing_note:
  enable: true
  title: "Pricing information"
  content: "Prices are listed in USD per account and exclude applicable taxes. Annual billing is equivalent to 10 months of use and provides 12 months of access. Custom simulation development, system integration, data migration, and organisation-specific implementation services are scoped and quoted separately."
---
