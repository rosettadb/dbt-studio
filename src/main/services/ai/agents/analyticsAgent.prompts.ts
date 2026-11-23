import { buildComponentReference } from '../../../../shared/analyticsBi';

/**
 * Component reference for the analytics agent. Generated from the same
 * component specs the renderer uses (src/shared/analyticsBi/specs), so the
 * agent always sees the names and attributes that actually work.
 */
export const evidenceComponentRef = `
${buildComponentReference()}

### Page Frontmatter
---
title: My Dashboard
sidebar_position: 1
sidebar_badge: "New"
---
Add \`engine: legacy\` to the frontmatter only to render a page with the previous renderer.

### Examples
The Analytics page list has three read-only example dashboards (Sales Overview, Support Operations, Product Analytics). They can't be edited; the user can copy one with "Duplicate to my pages".
`;
