// npm run validate: checks content/ the way the export does before publishing (exit 1 on any error).
import { formatReport, validateContent } from '../packages/shared/src/index.ts';
import { readContentTree } from './lib/content.ts';

const tree = readContentTree(process.argv[2] ?? process.cwd());
const r = validateContent(tree);
if (r.errors.length || r.warnings.length) console.log(formatReport(r));
console.log(`${tree.lessons.size} lessons checked: ${r.errors.length} errors, ${r.warnings.length} warnings`);
process.exit(r.errors.length ? 1 : 0);
