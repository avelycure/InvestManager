import readme from '../README.md';
import specification from '../docs/specification.md';
import formats from '../docs/config-formats.md';
import architecture from '../docs/architecture.md';
import baselineReview from '../docs/code-review-baseline.md';
import type { HelpDocument } from './help';

export const HELP_DOCUMENTS: HelpDocument[] = [
  { name: 'README.md', content: readme },
  { name: 'docs/specification.md', content: specification },
  { name: 'docs/config-formats.md', content: formats },
  { name: 'docs/architecture.md', content: architecture },
  { name: 'docs/code-review-baseline.md', content: baselineReview },
];
